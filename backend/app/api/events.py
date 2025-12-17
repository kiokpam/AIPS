import uuid
import os
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, Optional, List

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, or_

from app.api.deps import CurrentMembership, get_current_membership, get_db, MembershipRole
from app.models.core import Alert as AlertModel, Camera as CameraModel, Store as StoreModel, MemberPermission, CountingZone
from app.schemas.events import CounterUpdateEvent, InOutUpdateEvent, AnomalyDetectedEvent, AlertResponse, AlertsResponse, DetectionUpdateEvent
from app.services.camera_manager import camera_manager
from app.services.websocket_manager import inout_ws_manager
import httpx

# Clips directory (shared with AI service)
# Smart resolution: prefer env var, then repo root with files, then fallback
clips_env = os.getenv('CLIPS_DIR')
if clips_env:
    CLIPS_DIR = Path(clips_env)
else:
    try:
        repo_root_clips = Path(__file__).resolve().parents[3] / 'clips'
        if repo_root_clips.exists() and any(repo_root_clips.glob('*.mp4')):
            CLIPS_DIR = repo_root_clips
        else:
            CLIPS_DIR = Path('/app/clips')
    except Exception:
        CLIPS_DIR = Path('/app/clips')

router = APIRouter(prefix="/events", tags=["events"])
logger = logging.getLogger(__name__)


def _get_allowed_camera_ids(current: CurrentMembership, db: Session) -> List[str]:
    """Get list of camera IDs that the current user can access"""
    if current.role == MembershipRole.manager:
        # Managers can see all cameras in their organization
        return [
            row[0]
            for row in db.query(CameraModel.id).filter(CameraModel.org_id == current.organization.id).all()
        ]
    else:
        # Members can only see cameras they have permission to view
        permissions = db.query(MemberPermission).filter(
            MemberPermission.membership_id == current.id,
            MemberPermission.can_view == True,
            MemberPermission.camera_id.isnot(None)
        ).all()
        return [perm.camera_id for perm in permissions]


@router.post("/counter-update")
def receive_counter_update(event: CounterUpdateEvent, db: Session = Depends(get_db)):
    """Receive counter update events from People Counting AI (zone-based counts)"""
    try:
        store = db.query(StoreModel).filter(StoreModel.id == event.store_id).first()
        if not store:
            logger.warning(f"Counter update received for non-existent store: {event.store_id}")
            raise HTTPException(status_code=404, detail="Store not found")

        db.execute(text("""
            INSERT INTO people_counts (time, store_id, zone_id, camera_id, value, org_id)
            VALUES (:time, :store_id, :zone_id, :camera_id, :value, :org_id)
            ON CONFLICT (time, store_id, zone_id) DO UPDATE SET
                value = :value,
                camera_id = COALESCE(:camera_id, people_counts.camera_id)
        """), {
            "time": event.ts,
            "store_id": event.store_id,
            "zone_id": event.zone_id,
            "camera_id": event.camera_id,
            "value": event.value,
            "org_id": store.org_id,
        })
        db.commit()
        logger.debug(f"Counter update stored: store={event.store_id}, zone={event.zone_id}, value={event.value}")
        return {"status": "success", "message": "Counter update stored"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to store counter update: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inout-update")
def receive_inout_update(event: InOutUpdateEvent, db: Session = Depends(get_db)):
    """
    Receive In/Out counting updates from AI service.
    
    AI detects line crossings and sends cumulative counts:
    - count_in: Total B→A crossings (entering)
    - count_out: Total A→B crossings (exiting)
    """
    try:
        # Verify camera exists
        camera = db.query(CameraModel).filter(CameraModel.id == event.camera_id).first()
        if not camera:
            logger.warning(f"InOut update received for non-existent camera: {event.camera_id}")
            raise HTTPException(status_code=404, detail="Camera not found")
        
        # Use camera's CURRENT store_id from database (ignore AI's cached store_id)
        # This ensures data is always associated with the camera's current store assignment
        current_store_id = camera.store_id
        
        if not current_store_id:
            logger.warning(f"InOut update for camera {event.camera_id} with no store assignment, skipping")
            return {"status": "skipped", "message": "Camera not assigned to a store"}
        
        # Verify store exists
        store = db.query(StoreModel).filter(StoreModel.id == current_store_id).first()
        if not store:
            logger.warning(f"InOut update - camera {event.camera_id} assigned to non-existent store: {current_store_id}")
            raise HTTPException(status_code=404, detail="Store not found")

        # Parse ISO timestamp string to datetime
        try:
            # Remove 'Z' suffix if present and parse
            ts_str = event.ts.rstrip('Z')
            if '+' in ts_str:
                # Has timezone offset, parse with timezone
                ts_dt = datetime.fromisoformat(ts_str)
            else:
                # No timezone, assume UTC
                ts_dt = datetime.fromisoformat(ts_str)
        except (ValueError, AttributeError):
            # Fallback to current time if parsing fails
            logger.warning(f"Failed to parse timestamp '{event.ts}', using current time")
            ts_dt = datetime.utcnow()
        
        # Insert into inout_counts table using camera's CURRENT store_id
        db.execute(text("""
            INSERT INTO inout_counts (time, camera_id, store_id, count_in, count_out, org_id)
            VALUES (:time, :camera_id, :store_id, :count_in, :count_out, :org_id)
            ON CONFLICT (time, camera_id) DO UPDATE SET
                count_in = :count_in,
                count_out = :count_out,
                store_id = :store_id
        """), {
            "time": ts_dt,
            "camera_id": event.camera_id,
            "store_id": current_store_id,  # Use current store_id, not AI's cached value
            "count_in": event.count_in,
            "count_out": event.count_out,
            "org_id": store.org_id,
        })
        db.commit()
        
        logger.debug(f"InOut update stored: camera={event.camera_id}, store={current_store_id}, in={event.count_in}, out={event.count_out}")

        payload = {
            "type": "inout_update",
            "camera_id": event.camera_id,
            "store_id": current_store_id,  # Broadcast with current store_id
            "count_in": event.count_in,
            "count_out": event.count_out,
            "ts": ts_dt.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z'),
        }
        try:
            anyio.from_thread.run(inout_ws_manager.broadcast, store.org_id, payload)
        except RuntimeError:
            import asyncio
            asyncio.create_task(inout_ws_manager.broadcast(store.org_id, payload))

        return {"status": "success", "message": "InOut update stored"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to store inout update: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detection-update")
def receive_detection_update(event: DetectionUpdateEvent, db: Session = Depends(get_db)):
    """
    Receive real-time detection data from AI service.
    
    This endpoint receives bounding boxes and labels for visualization.
    Data is stored in-memory (not persisted) and used by the stream overlay.
    
    If store_id and zone_id are provided, also stores people_in_zone count to database
    for use in the counting dashboard.
    """
    try:
        # Convert to format expected by camera manager
        detections = [
            {
                "track_id": d.track_id,
                "bbox": d.bbox,
                "label": d.label,
                "confidence": d.confidence,
                "in_zone": d.in_zone,
            }
            for d in event.detections
        ]
        
        # Log occasionally for debugging
        if len(detections) > 0:
            logger.debug(f"Received {len(detections)} detections for camera {event.camera_id}, {event.people_in_zone} in zone")
        
        # Update camera manager with latest detections
        camera_manager.update_detections(
            camera_id=event.camera_id,
            detections=detections,
            people_in_zone=event.people_in_zone
        )
        
        # If store_id and zone_id provided, also store to database for counting dashboard
        if event.store_id and event.zone_id:
            try:
                store = db.query(StoreModel).filter(StoreModel.id == event.store_id).first()
                if store:
                    db.execute(text("""
                        INSERT INTO people_counts (time, store_id, zone_id, camera_id, value, org_id)
                        VALUES (:time, :store_id, :zone_id, :camera_id, :value, :org_id)
                        ON CONFLICT (time, store_id, zone_id) DO UPDATE SET
                            value = :value,
                            camera_id = COALESCE(:camera_id, people_counts.camera_id)
                    """), {
                        "time": event.ts,
                        "store_id": event.store_id,
                        "zone_id": event.zone_id,
                        "camera_id": event.camera_id,
                        "value": event.people_in_zone,
                        "org_id": store.org_id,
                    })
                    db.commit()
            except Exception as db_error:
                db.rollback()
                logger.warning(f"Failed to store people count to database: {db_error}")
                # Continue anyway - in-memory data is still updated for visualization
        else:
            # If store_id or zone_id missing, try to look them up from camera
            try:
                camera = db.query(CameraModel).filter(CameraModel.id == event.camera_id).first()
                if camera:
                    # Get first active zone for this camera
                    zone = db.query(CountingZone).filter(
                        CountingZone.camera_id == event.camera_id,
                        CountingZone.is_active == True
                    ).first()
                    
                    if zone:
                        db.execute(text("""
                            INSERT INTO people_counts (time, store_id, zone_id, camera_id, value, org_id)
                            VALUES (:time, :store_id, :zone_id, :camera_id, :value, :org_id)
                            ON CONFLICT (time, store_id, zone_id) DO UPDATE SET
                                value = :value,
                                camera_id = COALESCE(:camera_id, people_counts.camera_id)
                        """), {
                            "time": event.ts,
                            "store_id": camera.store_id,
                            "zone_id": zone.id,
                            "camera_id": event.camera_id,
                            "value": event.people_in_zone,
                            "org_id": camera.org_id,
                        })
                        db.commit()
            except Exception as db_error:
                db.rollback()
                logger.debug(f"Could not auto-lookup store/zone for camera {event.camera_id}: {db_error}")
                # Continue anyway - in-memory data is still updated for visualization
        
        return {"status": "success", "count": len(detections)}
    except Exception as e:
        logger.error(f"Failed to process detection update: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/inout-counts")
def get_inout_counts(
    camera_id: Optional[str] = None,
    store_id: Optional[str] = None,
    limit: int = Query(100, le=1000),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get recent In/Out count data for dashboard (filtered by member permissions)."""
    try:
        # Get allowed cameras for this user
        allowed_camera_ids = _get_allowed_camera_ids(current, db)
        
        if not allowed_camera_ids:
            # No camera access, return empty
            return []
        
        base_query = "SELECT time, camera_id, store_id, count_in, count_out FROM inout_counts WHERE org_id = :org_id"
        params = {"org_id": current.organization.id, "limit": limit}
        
        # Filter by allowed cameras
        camera_ids_str = ",".join(f"'{cid}'" for cid in allowed_camera_ids)
        base_query += f" AND camera_id IN ({camera_ids_str})"

        if camera_id:
            if camera_id not in allowed_camera_ids:
                raise HTTPException(status_code=403, detail="Camera access denied")
            base_query += " AND camera_id = :camera_id"
            params["camera_id"] = camera_id
        
        if store_id:
            base_query += " AND store_id = :store_id"
            params["store_id"] = store_id

        base_query += " ORDER BY time DESC LIMIT :limit"

        result = db.execute(text(base_query), params)
        rows = result.fetchall()

        return [
            {
                "time": row.time.isoformat() if hasattr(row.time, 'isoformat') else str(row.time),
                "camera_id": row.camera_id,
                "store_id": row.store_id,
                "count_in": row.count_in,
                "count_out": row.count_out,
            }
            for row in rows
        ]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching inout counts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching inout counts")


@router.get("/inout-summary")
def get_inout_summary(
    store_id: Optional[str] = None,
    time_range: Optional[str] = Query(None, description="Time range filter: 'today', 'week', 'month', or None for all-time"),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get summary of In/Out counts (latest totals per camera, filtered by member permissions and time range)."""
    from datetime import datetime, timezone
    
    # Get allowed cameras for this user
    allowed_camera_ids = _get_allowed_camera_ids(current, db)
    
    if not allowed_camera_ids:
        # No camera access, return empty summary
        return {
            "total_in": 0,
            "total_out": 0,
            "net": 0,
            "cameras": []
        }
    
    # Calculate time filter if requested
    params = {"org_id": current.organization.id}
    time_filter = ""
    if time_range:
        now = datetime.now(timezone.utc)
        start = None
        if time_range == 'today':
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_range == 'week':
            # Start of week (Monday)
            start = now - timedelta(days=now.weekday())
            start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        elif time_range == 'month':
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        if start:
            time_filter = " AND time >= :start_time"
            params["start_time"] = start
    
    # Get the latest counts for each camera
    camera_ids_str = ",".join(f"'{cid}'" for cid in allowed_camera_ids)
    
    logger.info(f"InOut Summary request - store_id: {store_id}, time_range: {time_range}, allowed_cameras: {len(allowed_camera_ids)}")
    
    # Build WHERE clause - store_id filter must be INSIDE the subquery to get correct latest per camera per store
    where_clauses = [f"org_id = :org_id", f"camera_id IN ({camera_ids_str})"]
    if store_id:
        where_clauses.append("store_id = :store_id")
        params["store_id"] = store_id
    if time_filter:
        where_clauses.append(time_filter.replace(" AND ", ""))
    
    where_clause = " AND ".join(where_clauses)
    
    base_query = f"""
        SELECT DISTINCT ON (camera_id) 
            camera_id, store_id, count_in, count_out, time
        FROM inout_counts 
        WHERE {where_clause}
        ORDER BY camera_id, time DESC
    """
    
    result = db.execute(text(base_query), params)
    rows = result.fetchall()
    
    logger.info(f"InOut Summary query returned {len(rows)} camera records")
    if len(rows) > 0:
        logger.debug(f"Sample row: camera={rows[0].camera_id}, store={rows[0].store_id}, in={rows[0].count_in}, out={rows[0].count_out}")
    
    total_in = sum(row.count_in for row in rows)
    total_out = sum(row.count_out for row in rows)
    
    return {
        "total_in": total_in,
        "total_out": total_out,
        "net": total_in - total_out,
        "cameras": [
            {
                "camera_id": row.camera_id,
                "store_id": row.store_id,
                "count_in": row.count_in,
                "count_out": row.count_out,
                "last_updated": row.time.isoformat() if hasattr(row.time, 'isoformat') else str(row.time),
            }
            for row in rows
        ]
    }

@router.post("/anomaly-detected")
def receive_anomaly_detected(event: AnomalyDetectedEvent, db: Session = Depends(get_db)):
    """Receive anomaly detection events from Behavior Detection AI"""
    try:
        # Map severity float to string
        severity_float = event.severity
        if severity_float >= 0.8:
            severity_str = "high"
        elif severity_float >= 0.5:
            severity_str = "medium"
        else:
            severity_str = "low"
        
        # Create alert in database
        store = db.query(StoreModel).filter(StoreModel.id == event.store_id).first()
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

        if event.camera_id:
            camera = (
                db.query(CameraModel)
                .filter(CameraModel.id == event.camera_id, CameraModel.org_id == store.org_id)
                .first()
            )
            if not camera:
                raise HTTPException(status_code=404, detail="Camera not found")

        # Extract filename from clip_ref if provided (clip_ref might be full path)
        clip_filename = None
        if event.clip_ref:
            # Extract just the filename from path (e.g., "/app/clips/camera_id_track_id_shoplifting_55.mp4" -> "camera_id_track_id_shoplifting_55.mp4")
            clip_filename = Path(event.clip_ref).name

        alert = AlertModel(
            id=str(uuid.uuid4()),
            type="anomaly",
            severity=severity_str,
            message=f"Anomaly detected: {event.type}",
            store_id=event.store_id,
            camera_id=event.camera_id,
            anomaly_type=event.type,
            confidence=severity_float,
            clip_ref=clip_filename,  # Store just the filename for matching
            timestamp=datetime.fromisoformat(event.ts.replace('Z', '+00:00')) if isinstance(event.ts, str) else event.ts,
            acknowledged=False,
            org_id=store.org_id,
        )
        
        db.add(alert)
        db.commit()
        db.refresh(alert)
        
        logger.info(f"Anomaly detected: {event.type} at {event.store_id}/{event.camera_id} - severity: {event.severity} (Alert ID: {alert.id})")
        
        # Get store and camera names for notification
        store_name = store.name if store else None
        camera_name = camera.name if camera else None
        
        # Prepare notification data
        notification_url = os.getenv("NOTIFICATION_SERVICE_URL", "http://notification:8004")
        clip_path = None
        if event.clip_ref:
            # Full path to clip for Telegram
            clip_path = f"/app/clips/{clip_filename}"
        
        alert_data = {
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
        
        # Send notification via notification service
        try:
            notification_payload = {
                "org_id": store.org_id,
                "alert_id": alert.id,
                "type": "alert",
                "channels": ["websocket", "telegram"],
                "data": {
                    "type": "alert_update",
                    "alert": alert_data,
                    "video_path": clip_path,  # For Telegram video
                    "message": f"🚨 Alert: {alert.anomaly_type} detected at {store_name or 'Unknown Store'}"
                }
            }
            
            # Call notification service asynchronously (non-blocking)
            try:
                # Use httpx in a thread to avoid blocking
                def send_notification():
                    try:
                        httpx.post(
                            f"{notification_url}/notifications/send",
                            json=notification_payload,
                            timeout=5.0
                        )
                    except Exception as e:
                        logger.warning(f"Failed to send notification: {e}")
                
                import threading
                thread = threading.Thread(target=send_notification, daemon=True)
                thread.start()
            except Exception as e:
                logger.warning(f"Failed to start notification thread: {e}")
        except Exception as e:
            logger.warning(f"Failed to send notification via notification service: {e}")
            # Continue even if notification fails
        
        return {"status": "success", "message": "Anomaly event received and stored", "alert_id": alert.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to store anomaly event: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/people-counts")
def get_people_counts(
    store_id: Optional[str] = None,
    camera_id: Optional[str] = None,
    limit: int = 100,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get recent people count data (filtered by member permissions)"""
    # Get allowed cameras for this user
    allowed_camera_ids = _get_allowed_camera_ids(current, db)
    
    if not allowed_camera_ids:
        # No camera access, return empty
        return []
    
    camera_ids_str = ",".join(f"'{cid}'" for cid in allowed_camera_ids)
    base_query = f"SELECT time, store_id, zone_id, camera_id, value FROM people_counts WHERE org_id = :org_id AND camera_id IN ({camera_ids_str})"
    params = {"org_id": current.organization.id, "limit": limit}

    if store_id:
        base_query += " AND store_id = :store_id"
        params["store_id"] = store_id
    
    if camera_id:
        if camera_id not in allowed_camera_ids:
            raise HTTPException(status_code=403, detail="Camera access denied")
        base_query += " AND camera_id = :camera_id"
        params["camera_id"] = camera_id

    base_query += " ORDER BY time DESC LIMIT :limit"

    result = db.execute(text(base_query), params)
    rows = result.fetchall()

    return [
        {
            "time": row.time.isoformat() if hasattr(row.time, 'isoformat') else str(row.time),
            "store_id": row.store_id,
            "zone_id": row.zone_id,
            "camera_id": row.camera_id,
            "value": row.value,
        }
        for row in rows
    ]

@router.get("/realtime-people-counts")
def get_realtime_people_counts(
    store_id: Optional[str] = None,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get real-time people counts from camera manager (filtered by member permissions)"""
    try:
        # Get allowed cameras for this user
        allowed_camera_ids = _get_allowed_camera_ids(current, db)
        
        logger.info(f"Realtime counts request - store_id: {store_id}, allowed_cameras: {len(allowed_camera_ids)}")
        
        if not allowed_camera_ids:
            # No camera access, return empty
            return []
        
        # Get cameras with people counts from camera manager
        cameras = [cam for cam in camera_manager.list_cameras() if cam.get("camera_id") in allowed_camera_ids]
        
        logger.debug(f"Camera manager has {len(cameras)} active cameras")
        
        # Build response mapping: camera_id -> store_id -> people_in_zone
        realtime_counts = {}
        for camera in cameras:
            camera_id = camera.get("camera_id")
            current_count = camera.get("current_count", 0)
            
            # Get camera details from DB
            cam = db.query(CameraModel).filter(CameraModel.id == camera_id).first()
            if cam:
                cam_store_id = cam.store_id
                
                logger.debug(f"Camera {camera_id} belongs to store {cam_store_id}, current count: {current_count}")
                
                # Filter by store if requested
                if store_id and cam_store_id != store_id:
                    logger.debug(f"Skipping camera {camera_id} - not in requested store {store_id}")
                    continue
                
                realtime_counts[camera_id] = {
                    "camera_id": camera_id,
                    "store_id": cam_store_id,
                    "people_in_zone": current_count,
                }
        
        logger.info(f"Returning {len(realtime_counts)} realtime count records")
        return list(realtime_counts.values())
    except Exception as e:
        logger.error(f"Error fetching realtime people counts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch realtime people counts")

@router.get("/camera/{camera_id}/recent-behaviors")
def get_camera_recent_behaviors(
    camera_id: str,
    limit: int = Query(5, ge=1, le=20),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get recent behaviors/alerts for a specific camera"""
    # Verify camera exists and user has access
    camera = (
        db.query(CameraModel)
        .filter(CameraModel.id == camera_id, CameraModel.org_id == current.organization.id)
        .first()
    )
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Check permissions for members
    if current.role == MembershipRole.member:
        permission = (
            db.query(MemberPermission)
            .filter(
                MemberPermission.membership_id == current.id,
                MemberPermission.camera_id == camera_id,
                MemberPermission.can_view == True
            )
            .first()
        )
        if not permission:
            raise HTTPException(status_code=403, detail="You don't have permission to view this camera")
    
    # Get recent alerts for this camera
    query = (
        db.query(AlertModel)
        .filter(
            AlertModel.camera_id == camera_id,
            AlertModel.org_id == current.organization.id,
            AlertModel.type == "anomaly"  # Only behavior/anomaly alerts
        )
        .order_by(AlertModel.timestamp.desc())
        .limit(limit)
    )
    
    alerts = query.all()
    
    return [
        {
            "id": alert.id,
            "type": alert.anomaly_type or "unknown",
            "severity": alert.severity,
            "message": alert.message,
            "timestamp": alert.timestamp.isoformat(),
            "confidence": alert.confidence,
        }
        for alert in alerts
    ]


@router.get("/behaviors/{camera_id}")
def get_behaviors_by_camera_id(
    camera_id: str,
    limit: int = Query(3, ge=1, le=20),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get recent behaviors/alerts for a specific camera (alias for /camera/{camera_id}/recent-behaviors)"""
    # Verify camera exists and user has access
    camera = (
        db.query(CameraModel)
        .filter(CameraModel.id == camera_id, CameraModel.org_id == current.organization.id)
        .first()
    )
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    # Check permissions for members
    if current.role == MembershipRole.member:
        permission = (
            db.query(MemberPermission)
            .filter(
                MemberPermission.membership_id == current.id,
                MemberPermission.camera_id == camera_id,
                MemberPermission.can_view == True
            )
            .first()
        )
        if not permission:
            raise HTTPException(status_code=403, detail="You don't have permission to view this camera")
    
    # Get recent alerts for this camera
    query = (
        db.query(AlertModel)
        .filter(
            AlertModel.camera_id == camera_id,
            AlertModel.org_id == current.organization.id,
            AlertModel.type == "anomaly"  # Only behavior/anomaly alerts
        )
        .order_by(AlertModel.timestamp.desc())
        .limit(limit)
    )
    
    alerts = query.all()
    
    return [
        {
            "id": alert.id,
            "type": alert.anomaly_type or "unknown",
            "severity": alert.severity,
            "message": alert.message,
            "timestamp": alert.timestamp.isoformat(),
            "confidence": alert.confidence,
        }
        for alert in alerts
    ]


@router.get("/alerts", response_model=AlertsResponse)
def get_alerts(
    limit: int = Query(50, ge=1, le=100),
    unread_only: bool = Query(False),
    store_id: Optional[str] = Query(None),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
) -> AlertsResponse:
    """Get alerts for the current user's organization, filtered by permissions for members"""
    
    # Base query for alerts in the organization
    query = db.query(AlertModel).filter(AlertModel.org_id == current.organization.id)
    
    # For members, filter by camera permissions (more granular than store-level)
    if current.role == MembershipRole.member:
        # Get cameras the member has access to
        allowed_camera_ids = _get_allowed_camera_ids(current, db)
        
        if not allowed_camera_ids:
            # Member has no camera access, return empty
            return AlertsResponse(alerts=[], unread_count=0, total_count=0)
        
        # Filter alerts by accessible cameras
        query = query.filter(AlertModel.camera_id.in_(allowed_camera_ids))
    
    # Filter by store if provided
    if store_id:
        query = query.filter(AlertModel.store_id == store_id)
    
    # Filter unread only if requested
    if unread_only:
        query = query.filter(AlertModel.acknowledged == False)
    
    # Order by timestamp (newest first) and limit
    alerts = query.order_by(AlertModel.timestamp.desc()).limit(limit).all()
    
    # Get store and camera names for enrichment
    store_ids = {alert.store_id for alert in alerts if alert.store_id}
    camera_ids = {alert.camera_id for alert in alerts if alert.camera_id}
    
    stores = {}
    if store_ids:
        store_rows = db.query(StoreModel).filter(StoreModel.id.in_(store_ids)).all()
        stores = {store.id: store.name for store in store_rows}
    
    cameras = {}
    if camera_ids:
        camera_rows = db.query(CameraModel).filter(CameraModel.id.in_(camera_ids)).all()
        cameras = {camera.id: camera.name for camera in camera_rows}
    
    # Build response
    alert_responses = [
        AlertResponse(
            id=alert.id,
            type=alert.type,
            severity=alert.severity,
            message=alert.message,
            store_id=alert.store_id,
            camera_id=alert.camera_id,
            anomaly_type=alert.anomaly_type,
            confidence=alert.confidence,
            clip_ref=alert.clip_ref,
            timestamp=alert.timestamp,
            acknowledged=alert.acknowledged,
            store_name=stores.get(alert.store_id) if alert.store_id else None,
            camera_name=cameras.get(alert.camera_id) if alert.camera_id else None,
        )
        for alert in alerts
    ]
    
    # Count unread alerts
    unread_count = db.query(AlertModel).filter(
        AlertModel.org_id == current.organization.id,
        AlertModel.acknowledged == False
    ).count()
    
    # Apply member store filtering for unread count
    if current.role == MembershipRole.member:
        store_permissions = db.query(MemberPermission.store_id).filter(
            MemberPermission.membership_id == current.membership.id,
            MemberPermission.store_id.isnot(None)
        ).distinct().all()
        accessible_store_ids = [perm[0] for perm in store_permissions if perm[0]]
        if accessible_store_ids:
            unread_count = db.query(AlertModel).filter(
                AlertModel.org_id == current.organization.id,
                AlertModel.acknowledged == False,
                AlertModel.store_id.in_(accessible_store_ids)
            ).count()
        else:
            unread_count = 0
    
    return AlertsResponse(
        alerts=alert_responses,
        unread_count=unread_count,
        total_count=len(alert_responses)
    )

@router.put("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Mark an alert as acknowledged"""
    alert = db.query(AlertModel).filter(
        AlertModel.id == alert_id,
        AlertModel.org_id == current.organization.id
    ).first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    # For members, check if they have access to the store
    if current.role == MembershipRole.member and alert.store_id:
        has_access = db.query(MemberPermission).filter(
            MemberPermission.membership_id == current.membership.id,
            MemberPermission.store_id == alert.store_id
        ).first()
        if not has_access:
            raise HTTPException(status_code=403, detail="You don't have permission to access this alert")
    
    alert.acknowledged = True
    db.commit()
    db.refresh(alert)
    
    return {"status": "success", "message": "Alert acknowledged"}

@router.put("/alerts/acknowledge-all")
def acknowledge_all_alerts(
    store_id: Optional[str] = Query(None),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Mark all unread alerts as acknowledged"""
    query = db.query(AlertModel).filter(
        AlertModel.org_id == current.organization.id,
        AlertModel.acknowledged == False
    )
    
    # For members, filter by store permissions
    if current.role == MembershipRole.member:
        store_permissions = db.query(MemberPermission.store_id).filter(
            MemberPermission.membership_id == current.membership.id,
            MemberPermission.store_id.isnot(None)
        ).distinct().all()
        accessible_store_ids = [perm[0] for perm in store_permissions if perm[0]]
        if not accessible_store_ids:
            return {"status": "success", "message": "No alerts to acknowledge", "count": 0}
        query = query.filter(AlertModel.store_id.in_(accessible_store_ids))
    
    if store_id:
        query = query.filter(AlertModel.store_id == store_id)
    
    alerts = query.all()
    count = len(alerts)
    
    for alert in alerts:
        alert.acknowledged = True
    
    db.commit()
    
    return {"status": "success", "message": f"{count} alert(s) acknowledged", "count": count}


@router.get("/clips")
def list_clips(
    camera_id: Optional[str] = None,
    limit: int = Query(50, le=200),
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """List available anomaly clips (filtered by member permissions)."""
    if not CLIPS_DIR.exists():
        return {"clips": [], "total": 0}
    
    # Get allowed cameras for this user (member permission filtering)
    allowed_camera_ids = _get_allowed_camera_ids(current, db)
    
    if not allowed_camera_ids:
        # No camera access, return empty
        return {"clips": [], "total": 0}
    
    clips = []
    for clip_path in CLIPS_DIR.glob("*.mp4"):
        # Parse clip filename: {camera_id}_{track_id}_{label}_{score}.mp4
        name = clip_path.stem
        parts = name.split('_')
        
        clip_camera_id = parts[0] if len(parts) > 0 else None
        
        # Filter by member permissions - only show clips from allowed cameras
        if clip_camera_id not in allowed_camera_ids:
            continue
        
        # Filter by camera if specified
        if camera_id and clip_camera_id != camera_id:
            continue
        
        clips.append({
            "name": clip_path.name,
            "camera_id": clip_camera_id,
            "track_id": parts[1] if len(parts) > 1 else None,
            "label": parts[2] if len(parts) > 2 else None,
            "score": parts[3] if len(parts) > 3 else None,
            "size": clip_path.stat().st_size,
            "created": datetime.fromtimestamp(clip_path.stat().st_mtime).isoformat(),
        })
    
    # Sort by creation time (newest first)
    clips.sort(key=lambda x: x['created'], reverse=True)
    
    return {
        "clips": clips[:limit],
        "total": len(clips),
    }


@router.get("/clips/{clip_name}")
def get_clip(
    clip_name: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Download an anomaly clip (with member permission check)."""
    # Sanitize filename to prevent directory traversal
    safe_name = Path(clip_name).name
    clip_path = CLIPS_DIR / safe_name
    
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    
    # Get allowed cameras for this user (member permission filtering)
    allowed_camera_ids = _get_allowed_camera_ids(current, db)
    
    # Parse camera_id from filename: {camera_id}_{track_id}_{label}_{score}.mp4
    parts = safe_name.split('_')
    clip_camera_id = parts[0] if len(parts) > 0 else None
    
    # Check if member has access to this camera's clips
    if clip_camera_id and clip_camera_id not in allowed_camera_ids:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to view clips from this camera")
    
    return FileResponse(
        path=clip_path,
        media_type="video/mp4",
        filename=safe_name,
    )


@router.delete("/clips/{clip_name}")
def delete_clip(
    clip_name: str,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Delete an anomaly clip (manager/owner only, with camera permission check)."""
    # Only managers and owners can delete clips
    if current.role not in ['manager', 'owner']:
        raise HTTPException(status_code=403, detail="Access denied: Only managers and owners can delete clips")
    
    # Sanitize filename to prevent directory traversal
    safe_name = Path(clip_name).name
    clip_path = CLIPS_DIR / safe_name
    
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    
    # Get allowed cameras for this user (member permission filtering)
    allowed_camera_ids = _get_allowed_camera_ids(current, db)
    
    # Parse camera_id from filename: {camera_id}_{track_id}_{label}_{score}.mp4
    parts = safe_name.split('_')
    clip_camera_id = parts[0] if len(parts) > 0 else None
    
    # Check if user has access to this camera's clips
    if clip_camera_id and clip_camera_id not in allowed_camera_ids:
        raise HTTPException(status_code=403, detail="Access denied: You don't have permission to delete clips from this camera")
    
    # Delete the file
    try:
        clip_path.unlink()
        logger.info(f"Clip deleted: {safe_name} by user {current.member.user.email}")
        return {"status": "success", "message": f"Clip {safe_name} deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete clip {safe_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete clip: {str(e)}")
