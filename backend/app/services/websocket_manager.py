from collections import defaultdict
from typing import Dict, Set
import threading
import uuid
import os
import httpx
from datetime import datetime, timezone
from pathlib import Path

from fastapi import WebSocket


class InOutWebSocketManager:
    """Tracks websocket connections per organization for in/out realtime updates."""

    def __init__(self) -> None:
        self.connections: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, org_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[org_id].add(websocket)

    def disconnect(self, org_id: str, websocket: WebSocket) -> None:
        if org_id in self.connections:
            self.connections[org_id].discard(websocket)
            if not self.connections[org_id]:
                self.connections.pop(org_id, None)

    async def broadcast(self, org_id: str, message: dict) -> None:
        """Send a message to all clients connected for an organization."""
        connections = list(self.connections.get(org_id, []))
        to_remove: Set[WebSocket] = set()

        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                to_remove.add(websocket)

        for websocket in to_remove:
            self.disconnect(org_id, websocket)


inout_ws_manager = InOutWebSocketManager()


class DetectionWebSocketManager:
    """Manages WebSocket connections for detection updates (AI service → Backend → Frontend)."""
    
    def __init__(self) -> None:
        # AI service connections (camera_id -> websocket)
        self.ai_connections: Dict[str, WebSocket] = {}
        # Frontend connections (org_id -> set of websockets)
        self.frontend_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.lock = threading.Lock()
    
    async def connect_ai(self, camera_id: str, websocket: WebSocket) -> None:
        """AI service connects to send detection updates.
        
        Note: websocket.accept() must be called before this method.
        """
        with self.lock:
            # Close existing connection if any
            if camera_id in self.ai_connections:
                try:
                    await self.ai_connections[camera_id].close()
                except:
                    pass
            self.ai_connections[camera_id] = websocket
    
    def disconnect_ai(self, camera_id: str) -> None:
        """AI service disconnects."""
        with self.lock:
            self.ai_connections.pop(camera_id, None)
    
    async def connect_frontend(self, org_id: str, websocket: WebSocket) -> None:
        """Frontend client connects to receive detection updates.
        
        Note: websocket.accept() must be called before this method.
        """
        with self.lock:
            self.frontend_connections[org_id].add(websocket)
    
    def disconnect_frontend(self, org_id: str, websocket: WebSocket) -> None:
        """Frontend client disconnects."""
        with self.lock:
            if org_id in self.frontend_connections:
                self.frontend_connections[org_id].discard(websocket)
                if not self.frontend_connections[org_id]:
                    self.frontend_connections.pop(org_id, None)
    
    async def receive_from_ai(self, camera_id: str, message: dict) -> None:
        """Receive messages from AI service and route to appropriate handlers.
        
        Supports three message types:
        - 'detection': Detection updates (bounding boxes, people in zone)
        - 'inout': In/Out count updates
        - 'alert': Behavior detection alerts
        """
        from app.services.camera_manager import camera_manager
        from app.db.session import SessionLocal
        from app.models.core import Camera as CameraModel
        
        # Get camera's org_id from database
        db = SessionLocal()
        try:
            camera = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
            if not camera:
                return
            org_id = camera.org_id
        finally:
            db.close()
        
        message_type = message.get('message_type', 'detection')  # Default to detection for backward compatibility
        
        import logging
        logger = logging.getLogger(__name__)
        
        if message_type == 'detection':
            await self._handle_detection_message(camera_id, org_id, message, camera_manager)
        elif message_type == 'inout':
            await self._handle_inout_message(camera_id, org_id, message)
        elif message_type == 'alert':
            logger.info(f"Received alert message from AI service for camera {camera_id}: {message.get('type', 'unknown')}")
            await self._handle_alert_message(camera_id, org_id, message)
        else:
            logger.warning(f"Unknown message type from AI service: {message_type}")
    
    async def _handle_detection_message(self, camera_id: str, org_id: str, message: dict, camera_manager) -> None:
        """Handle detection update messages.
        
        Note: DB persistence for people_in_zone is disabled to optimize real-time performance.
        Use HTTP endpoint /api/events/detection-update for persistent storage if needed.
        """
        camera_worker = camera_manager.get_camera(camera_id)
        if not camera_worker:
            return
        
        # Update camera manager (for backward compatibility with HTTP endpoint)
        detections = [
            {
                "track_id": d.get("track_id"),
                "bbox": d.get("bbox"),
                "label": d.get("label", ""),
                "confidence": d.get("confidence", 0.0),
                "in_zone": d.get("in_zone", False),
            }
            for d in message.get("detections", [])
        ]
        camera_manager.update_detections(
            camera_id=camera_id,
            detections=detections,
            people_in_zone=message.get("people_in_zone", 0),
            metrics=message.get("metrics")
        )
        
        # Broadcast to frontend clients for this organization
        detection_message = {
            "type": "detection_update",
            "camera_id": camera_id,
            "detections": detections,
            "people_in_zone": message.get("people_in_zone", 0),
            "ts": message.get("ts", "")
        }
        # Include metrics if available
        if "metrics" in message:
            detection_message["metrics"] = message["metrics"]
        
        with self.lock:
            connections = list(self.frontend_connections.get(org_id, []))
        
        to_remove: Set[WebSocket] = set()
        for websocket in connections:
            try:
                await websocket.send_json(detection_message)
            except Exception:
                to_remove.add(websocket)
        
        # Clean up dead connections
        for websocket in to_remove:
            self.disconnect_frontend(org_id, websocket)
    
    async def _handle_inout_message(self, camera_id: str, org_id: str, message: dict) -> None:
        """Handle in/out count update messages."""
        from app.models.core import Store
        from app.db.session import SessionLocal
        from sqlalchemy import text
        import logging
        
        logger = logging.getLogger(__name__)
        db = SessionLocal()
        
        try:
            store_id = message.get('store_id')
            if not store_id:
                logger.warning(f"InOut message missing store_id for camera {camera_id}")
                return
            
            # Get store to verify org_id
            store = db.query(Store).filter(Store.id == store_id).first()
            if not store or store.org_id != org_id:
                logger.warning(f"Store {store_id} not found or org mismatch for camera {camera_id}")
                return
            
            # Parse timestamp
            ts_str = message.get('ts', '')
            try:
                if ts_str.endswith('Z'):
                    ts_dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                else:
                    ts_dt = datetime.fromisoformat(ts_str)
                if ts_dt.tzinfo is None:
                    ts_dt = ts_dt.replace(tzinfo=timezone.utc)
            except Exception as e:
                logger.warning(f"Failed to parse timestamp {ts_str}: {e}")
                ts_dt = datetime.now(timezone.utc)
            
            # Store in database (same logic as HTTP endpoint)
            db.execute(text("""
                INSERT INTO inout_counts (time, camera_id, store_id, count_in, count_out, org_id)
                VALUES (:time, :camera_id, :store_id, :count_in, :count_out, :org_id)
                ON CONFLICT (time, camera_id) DO UPDATE SET
                    count_in = :count_in,
                    count_out = :count_out
            """), {
                "time": ts_dt,
                "camera_id": camera_id,
                "store_id": store_id,
                "count_in": message.get('count_in', 0),
                "count_out": message.get('count_out', 0),
                "org_id": org_id,
            })
            db.commit()
            
            # Broadcast to frontend via inout_ws_manager
            payload = {
                "type": "inout_update",
                "camera_id": camera_id,
                "store_id": store_id,
                "count_in": message.get('count_in', 0),
                "count_out": message.get('count_out', 0),
                "ts": ts_dt.isoformat().replace('+00:00', 'Z'),
            }
            
            await inout_ws_manager.broadcast(org_id, payload)
            logger.debug(f"InOut update via WebSocket: camera={camera_id}, in={message.get('count_in', 0)}, out={message.get('count_out', 0)}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to handle inout message: {e}", exc_info=True)
        finally:
            db.close()
    
    async def _handle_alert_message(self, camera_id: str, org_id: str, message: dict) -> None:
        """Handle behavior alert messages."""
        from app.models.core import Store, Camera, Alert as AlertModel
        from app.db.session import SessionLocal
        import logging
        
        logger = logging.getLogger(__name__)
        db = SessionLocal()
        
        try:
            store_id = message.get('store_id')
            if not store_id:
                logger.warning(f"Alert message missing store_id for camera {camera_id}")
                return
            
            # Get store and camera to verify org_id
            store = db.query(Store).filter(Store.id == store_id).first()
            camera = db.query(Camera).filter(Camera.id == camera_id).first()
            
            if not store or store.org_id != org_id:
                logger.warning(f"Store {store_id} not found or org mismatch for camera {camera_id}")
                return
            
            # Parse timestamp
            ts_str = message.get('ts', '')
            try:
                if ts_str.endswith('Z'):
                    ts_dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                else:
                    ts_dt = datetime.fromisoformat(ts_str)
                if ts_dt.tzinfo is None:
                    ts_dt = ts_dt.replace(tzinfo=timezone.utc)
            except Exception as e:
                logger.warning(f"Failed to parse timestamp {ts_str}: {e}")
                ts_dt = datetime.now(timezone.utc)
            
            # Create alert in database (same logic as HTTP endpoint)
            anomaly_type = message.get('type', 'unknown')
            severity_float = message.get('severity', 0.0)
            clip_ref = message.get('clip_ref', '')
            
            # Map severity float to string
            if severity_float >= 0.8:
                severity_str = "high"
            elif severity_float >= 0.5:
                severity_str = "medium"
            else:
                severity_str = "low"
            
            # Extract filename from clip_ref if provided
            clip_filename = None
            if clip_ref:
                clip_filename = Path(clip_ref).name
            
            alert = AlertModel(
                id=str(uuid.uuid4()),
                type="anomaly",
                severity=severity_str,
                message=f"Anomaly detected: {anomaly_type}",
                store_id=store_id,
                camera_id=camera_id,
                anomaly_type=anomaly_type,
                confidence=severity_float,
                clip_ref=clip_filename,
                timestamp=ts_dt,
                acknowledged=False,
                org_id=org_id
            )
            db.add(alert)
            db.commit()
            db.refresh(alert)
            
            logger.info(f"Alert created via WebSocket: {anomaly_type} at {store_id}/{camera_id} - severity: {severity_str} (Alert ID: {alert.id})")
            
            # Get store and camera names for WebSocket message
            store_name = store.name if store else None
            camera_name = camera.name if camera else None
            
            # Broadcast alert via WebSocket to all connected clients in the organization
            alert_message = {
                "type": "alert_update",
                "alert": {
                    "id": alert.id,
                    "type": alert.type,
                    "severity": alert.severity,
                    "message": alert.message,
                    "store_id": alert.store_id,
                    "camera_id": alert.camera_id,
                    "anomaly_type": alert.anomaly_type,
                    "confidence": alert.confidence,
                    "clip_ref": alert.clip_ref,
                    "timestamp": alert.timestamp.isoformat().replace('+00:00', 'Z') if alert.timestamp.tzinfo else alert.timestamp.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z'),
                    "acknowledged": alert.acknowledged,
                    "store_name": store_name,
                    "camera_name": camera_name,
                }
            }
            
            await alerts_ws_manager.broadcast(org_id, alert_message)
            logger.info(f"Alert broadcasted to frontend clients for org {org_id}: {anomaly_type} (Alert ID: {alert.id})")
            
            # Also forward to notification service so it can broadcast via its websocket
            # Choose URL based on environment: in Docker use service name, otherwise localhost
            notification_url_env = os.getenv("NOTIFICATION_SERVICE_URL")
            if notification_url_env:
                notification_url = notification_url_env
            else:
                in_docker = os.path.exists("/.dockerenv") or os.getenv("DOCKER_ENV") == "1"
                notification_url = "http://notification:8004" if in_docker else os.getenv(
                    "NOTIFICATION_SERVICE_FALLBACK_URL", "http://localhost:8004"
                )
            clip_path = None
            if clip_filename:
                clips_dir = os.getenv("CLIPS_DIR", "/app/clips")
                clip_path = f"{clips_dir}/{clip_filename}"
            
            try:
                notification_payload = {
                    "org_id": org_id,
                    "alert_id": alert.id,
                    "type": "alert",
                    "channels": ["websocket"],
                    "data": {
                        "type": "alert_update",
                        "alert": {
                            "id": alert.id,
                            "type": alert.type,
                            "severity": alert.severity,
                            "message": alert.message,
                            "store_id": alert.store_id,
                            "camera_id": alert.camera_id,
                            "anomaly_type": alert.anomaly_type,
                            "confidence": alert.confidence,
                            "clip_ref": alert.clip_ref,
                            "timestamp": alert.timestamp.isoformat().replace('+00:00', 'Z') if alert.timestamp.tzinfo else alert.timestamp.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z'),
                            "acknowledged": alert.acknowledged,
                            "store_name": store_name,
                            "camera_name": camera_name,
                        },
                        "video_path": clip_path,
                        "message": f"🚨 Alert: {anomaly_type} detected at {store_name or 'Unknown Store'}"
                    }
                }
                
                # Call notification service asynchronously (non-blocking) with basic fallback
                def send_notification():
                    try:
                        httpx.post(
                            f"{notification_url}/notifications/send",
                            json=notification_payload,
                            timeout=5.0
                        )
                        logger.debug(f"Alert forwarded to notification service: {alert.id}")
                    except Exception as e:
                        logger.warning(f"Failed to forward alert to notification service: {e}")
                        # Fallback: if default docker hostname fails, try localhost; if localhost fails, try 127.0.0.1
                        try:
                            if "notification:8004" in notification_url:
                                fallback_url = "http://localhost:8004"
                            elif "localhost:8004" in notification_url:
                                fallback_url = "http://127.0.0.1:8004"
                            else:
                                fallback_url = None
                            if fallback_url:
                                httpx.post(
                                    f"{fallback_url}/notifications/send",
                                    json=notification_payload,
                                    timeout=5.0
                                )
                                logger.debug(
                                    f"Alert forwarded to notification service via fallback {fallback_url}: {alert.id}"
                                )
                        except Exception as e2:
                            logger.warning(
                                f"Fallback forwarding to notification service also failed: {e2}"
                            )
                
                thread = threading.Thread(target=send_notification, daemon=True)
                thread.start()
            except Exception as e:
                logger.warning(f"Failed to forward alert to notification service: {e}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to handle alert message: {e}", exc_info=True)
        finally:
            db.close()


detection_ws_manager = DetectionWebSocketManager()


class AlertsWebSocketManager:
    """Tracks websocket connections per organization for real-time alert/behavior detection updates."""

    def __init__(self) -> None:
        self.connections: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, org_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[org_id].add(websocket)

    def disconnect(self, org_id: str, websocket: WebSocket) -> None:
        if org_id in self.connections:
            self.connections[org_id].discard(websocket)
            if not self.connections[org_id]:
                self.connections.pop(org_id, None)

    async def broadcast(self, org_id: str, message: dict) -> None:
        """Send a message to all clients connected for an organization."""
        connections = list(self.connections.get(org_id, []))
        to_remove: Set[WebSocket] = set()

        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                to_remove.add(websocket)

        for websocket in to_remove:
            self.disconnect(org_id, websocket)


alerts_ws_manager = AlertsWebSocketManager()


