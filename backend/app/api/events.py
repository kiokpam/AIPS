import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
from app.api.deps import CurrentMembership, get_current_membership, get_db, MembershipRole
from app.models.core import Alert as AlertModel, Camera as CameraModel, Store as StoreModel, MemberPermission
from app.schemas.events import CounterUpdateEvent, AnomalyDetectedEvent, AlertResponse, AlertsResponse

router = APIRouter(prefix="/events", tags=["events"])

@router.post("/counter-update")
def receive_counter_update(event: CounterUpdateEvent, db: Session = Depends(get_db)):
    """Receive counter update events from People Counting AI"""
    try:
        store = db.query(StoreModel).filter(StoreModel.id == event.store_id).first()
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")

        db.execute(text("""
            INSERT INTO people_counts (time, store_id, zone_id, value, org_id)
            VALUES (:time, :store_id, :zone_id, :value, :org_id)
        """), {
            "time": event.ts,
            "store_id": event.store_id,
            "zone_id": event.zone_id,
            "value": event.value,
            "org_id": store.org_id,
        })
        db.commit()
        return {"status": "success", "message": "Counter update stored"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

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

        alert = AlertModel(
            id=str(uuid.uuid4()),
            type="anomaly",
            severity=severity_str,
            message=f"Anomaly detected: {event.type}",
            store_id=event.store_id,
            camera_id=event.camera_id,
            anomaly_type=event.type,
            confidence=severity_float,
            timestamp=datetime.fromisoformat(event.ts.replace('Z', '+00:00')) if isinstance(event.ts, str) else event.ts,
            acknowledged=False,
            org_id=store.org_id,
        )
        
        db.add(alert)
        db.commit()
        db.refresh(alert)
        
        print(f"Anomaly detected: {event.type} at {event.store_id}/{event.camera_id} - severity: {event.severity} (Alert ID: {alert.id})")
        return {"status": "success", "message": "Anomaly event received and stored", "alert_id": alert.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/people-counts")
def get_people_counts(
    store_id: Optional[str] = None,
    limit: int = 100,
    current: CurrentMembership = Depends(get_current_membership),
    db: Session = Depends(get_db),
):
    """Get recent people count data"""
    base_query = "SELECT time, store_id, zone_id, value FROM people_counts WHERE org_id = :org_id"
    params = {"org_id": current.organization.id, "limit": limit}

    if store_id:
        base_query += " AND store_id = :store_id"
        params["store_id"] = store_id

    base_query += " ORDER BY time DESC LIMIT :limit"

    result = db.execute(text(base_query), params)
    rows = result.fetchall()

    return [
        {
            "time": row.time.isoformat(),
            "store_id": row.store_id,
            "zone_id": row.zone_id,
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
