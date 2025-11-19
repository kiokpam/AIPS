from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class CounterUpdateEvent(BaseModel):
    event: str = "counter_update"
    store_id: str
    zone_id: str
    value: int
    ts: str

class AnomalyDetectedEvent(BaseModel):
    event: str = "anomaly_detected"
    store_id: str
    camera_id: str
    type: str
    severity: float
    clip_ref: str = None
    ts: str

class AlertResponse(BaseModel):
    id: str
    type: str
    severity: str
    message: str
    store_id: Optional[str] = None
    camera_id: Optional[str] = None
    anomaly_type: Optional[str] = None
    confidence: Optional[float] = None
    timestamp: datetime
    acknowledged: bool
    store_name: Optional[str] = None
    camera_name: Optional[str] = None

class AlertsResponse(BaseModel):
    alerts: List[AlertResponse]
    unread_count: int
    total_count: int
