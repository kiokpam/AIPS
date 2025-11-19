import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api.deps import CurrentMembership, get_current_membership, get_db
from app.models.core import Alert as AlertModel, Camera as CameraModel, Store as StoreModel
from app.schemas.events import CounterUpdateEvent, AnomalyDetectedEvent

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
