from datetime import datetime
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db.session import SessionLocal
from app.schemas.events import CounterUpdateEvent, AnomalyDetectedEvent

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
        # For now, just log the event (you can add an alerts table later)
        print(f"Anomaly detected: {event.type} at {event.store_id}/{event.camera_id} - severity: {event.severity}")
        return {"status": "success", "message": "Anomaly event received"}
    except Exception as e:
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
