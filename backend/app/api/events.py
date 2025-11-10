import uuid
from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import SessionLocal
from app.schemas.events import CounterUpdateEvent, AnomalyDetectedEvent
from app.models.core import Alert as AlertModel

router = APIRouter(prefix="/events", tags=["events"])

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/counter-update")
def receive_counter_update(event: CounterUpdateEvent, db: Session = Depends(get_db)):
    """Receive counter update events from People Counting AI"""
    try:
        # Insert into TimescaleDB hypertable
        db.execute(text("""
            INSERT INTO people_counts (time, store_id, zone_id, value)
            VALUES (:time, :store_id, :zone_id, :value)
        """), {
            "time": event.ts,
            "store_id": event.store_id,
            "zone_id": event.zone_id,
            "value": event.value
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
            acknowledged=False
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
def get_people_counts(store_id: str = None, limit: int = 100, db: Session = Depends(get_db)):
    """Get recent people count data"""
    query = "SELECT * FROM people_counts"
    params = {}
    
    if store_id:
        query += " WHERE store_id = :store_id"
        params["store_id"] = store_id
    
    query += " ORDER BY time DESC LIMIT :limit"
    params["limit"] = limit
    
    result = db.execute(text(query), params)
    rows = result.fetchall()
    
    return [
        {
            "time": row.time.isoformat(),
            "store_id": row.store_id,
            "zone_id": row.zone_id,
            "value": row.value
        }
        for row in rows
    ]
