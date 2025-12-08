import uuid
import os
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, or_

from app.api.deps import CurrentMembership, get_current_membership, get_db, MembershipRole
from app.models.core import Alert as AlertModel, Camera as CameraModel, Store as StoreModel, MemberPermission
from app.schemas.events import CounterUpdateEvent, InOutUpdateEvent, AnomalyDetectedEvent, AlertResponse, AlertsResponse, DetectionUpdateEvent
from app.services.camera_manager import camera_manager
from app.services.websocket_manager import inout_ws_manager
import httpx

# Clips directory (shared with AI service)
CLIPS_DIR = Path(os.environ.get('CLIPS_DIR', '/app/clips'))

router = APIRouter(prefix="/events", tags=["events"])
logger = logging.getLogger(__name__)


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
        
        # Verify store exists
        store = db.query(StoreModel).filter(StoreModel.id == event.store_id).first()
        if not store:
            logger.warning(f"InOut update received for non-existent store: {event.store_id}")
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
        
        # Insert into inout_counts table
        db.execute(text("""
            INSERT INTO inout_counts (time, camera_id, store_id, count_in, count_out, org_id)
            VALUES (:time, :camera_id, :store_id, :count_in, :count_out, :org_id)
            ON CONFLICT (time, camera_id) DO UPDATE SET
                count_in = :count_in,
                count_out = :count_out
        """), {
            "time": ts_dt,
            "camera_id": event.camera_id,
            "store_id": event.store_id,
            "count_in": event.count_in,
            "count_out": event.count_out,
            "org_id": store.org_id,
        })
        db.commit()
        
        logger.debug(f"InOut update stored: camera={event.camera_id}, in={event.count_in}, out={event.count_out}")

        payload = {
            "type": "inout_update",
            "camera_id": event.camera_id,
            "store_id": event.store_id,
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
def receive_detection_update(event: DetectionUpdateEvent):
    """
    Receive real-time detection data from AI service.
    
    This endpoint receives bounding boxes and labels for visualization.
    Data is stored in-memory (not persisted) and used by the stream overlay.
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
    """Get recent In/Out count data for dashboard."""
    try:
        base_query = "SELECT time, camera_id, store_id, count_in, count_out FROM inout_counts WHERE org_id = :org_id"
        params = {"org_id": current.organization.id, "limit": limit}

        if camera_id:
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
    except Exception as e:
        logger.error(f"Error fetching inout counts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching inout counts")


@router.get("/inout-summary")
def get_inout_summary(
    store_id: Optional[str] = None,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get summary of In/Out counts (latest totals per camera)."""
    # Get the latest counts for each camera
    base_query = """
        SELECT DISTINCT ON (camera_id) 
            camera_id, store_id, count_in, count_out, time
        FROM inout_counts 
        WHERE org_id = :org_id
    """
    params = {"org_id": current.organization.id}
    
    if store_id:
        base_query += " AND store_id = :store_id"
        params["store_id"] = store_id
    
    base_query += " ORDER BY camera_id, time DESC"
    
    result = db.execute(text(base_query), params)
    rows = result.fetchall()
    
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
    """Get recent people count data"""
    base_query = "SELECT time, store_id, zone_id, camera_id, value FROM people_counts WHERE org_id = :org_id"
    params = {"org_id": current.organization.id, "limit": limit}

    if store_id:
        base_query += " AND store_id = :store_id"
        params["store_id"] = store_id
    
    if camera_id:
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
    
    # For members, filter by store permissions
    if current.role == MembershipRole.member:
        # Get stores the member has access to
        store_permissions = db.query(MemberPermission.store_id).filter(
            MemberPermission.membership_id == current.membership.id,
            MemberPermission.store_id.isnot(None)
        ).distinct().all()
        
        accessible_store_ids = [perm[0] for perm in store_permissions if perm[0]]
        
        if not accessible_store_ids:
            # Member has no store access, return empty
            return AlertsResponse(alerts=[], unread_count=0, total_count=0)
        
        # Filter alerts by accessible stores
        query = query.filter(AlertModel.store_id.in_(accessible_store_ids))
    
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
):
    """List available anomaly clips."""
    if not CLIPS_DIR.exists():
        return {"clips": [], "total": 0}
    
    clips = []
    for clip_path in CLIPS_DIR.glob("*.mp4"):
        # Parse clip filename: {camera_id}_{track_id}_{label}_{score}.mp4
        name = clip_path.stem
        parts = name.split('_')
        
        clip_camera_id = parts[0] if len(parts) > 0 else None
        
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
):
    """Download an anomaly clip."""
    # Sanitize filename to prevent directory traversal
    safe_name = Path(clip_name).name
    clip_path = CLIPS_DIR / safe_name
    
    if not clip_path.exists():
        raise HTTPException(status_code=404, detail="Clip not found")
    
    return FileResponse(
        path=clip_path,
        media_type="video/mp4",
        filename=safe_name,
    )
