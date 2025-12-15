from pydantic import BaseModel, field_serializer
from datetime import datetime, timezone
from typing import Optional, List

class CounterUpdateEvent(BaseModel):
    """Zone-based people count update (current count in zone)."""
    event: str = "counter_update"
    store_id: str
    zone_id: str
    camera_id: Optional[str] = None  # Optional: for better tracking
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
    clip_ref: Optional[str] = None  # Reference to saved video clip filename
    timestamp: datetime
    acknowledged: bool
    store_name: Optional[str] = None
    camera_name: Optional[str] = None
    
    @field_serializer('timestamp')
    def serialize_timestamp(self, value: datetime) -> str:
        """Serialize timestamp as ISO format with Z suffix to indicate UTC."""
        if value.tzinfo is None:
            # Assume naive datetime is UTC
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat().replace('+00:00', 'Z')

class AlertsResponse(BaseModel):
    alerts: List[AlertResponse]
    unread_count: int
    total_count: int


class Detection(BaseModel):
    """Single person detection with bounding box."""
    track_id: int
    bbox: List[int]  # [x1, y1, x2, y2]
    label: str = ""  # MobileNet label (normal, suspicious, etc.)
    confidence: float = 0.0
    in_zone: bool = False  # Whether person is inside a zone


class DetectionUpdateEvent(BaseModel):
    """
    Real-time detection data from AI service.
    
    Sent every frame with current bounding boxes and labels.
    Used to visualize detections in the stream overlay.
    """
    event: str = "detection_update"
    camera_id: str
    store_id: Optional[str] = None  # Optional: for storing to people_counts table
    zone_id: Optional[str] = None   # Optional: for storing to people_counts table
    detections: List[Detection]
    people_in_zone: int = 0
    ts: str
