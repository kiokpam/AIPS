from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class CounterUpdateEvent(BaseModel):
    """Zone-based people count update (current count in zone)."""
    event: str = "counter_update"
    store_id: str
    zone_id: str
    value: int
    ts: str

class InOutUpdateEvent(BaseModel):
    """
    In/Out counting update from AI service.
    
    Sent when AI detects line crossings:
    - count_in: Cumulative count of B→A crossings
    - count_out: Cumulative count of A→B crossings
    """
    event: str = "inout_update"
    camera_id: str
    store_id: str
    count_in: int
    count_out: int
    ts: str  # ISO format timestamp

class AnomalyDetectedEvent(BaseModel):
    """
    Behavior anomaly detection event from AI service.
    
    Sent when VideoMAE detects suspicious behavior:
    - type: "shoplifting", "violence", etc.
    - severity: Confidence score (0.0-1.0)
    """
    event: str = "anomaly_detected"
    store_id: str
    camera_id: str
    type: str
    severity: float
    clip_ref: str = None  # Reference to saved video clip
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
