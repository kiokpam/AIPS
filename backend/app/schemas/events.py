from pydantic import BaseModel
from datetime import datetime

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
