from pydantic import BaseModel
from typing import List, Optional


class Store(BaseModel):
    id: str
    name: str


class StoreCreate(BaseModel):
    name: str


class Camera(BaseModel):
    id: str
    store_id: str
    name: str
    source: str  # RTSP URL, file path, or webcam ID
    ai_services: List[str] = ["people_counting", "behavior_detection"]
    model_name: str = "yolov8n.pt"
    device: str = "auto"
    conf_thresh: float = 0.5
    iou_thresh: float = 0.45
    max_det: int = 300
    skip_frame: int = 3
    is_active: bool = True


class CameraCreate(BaseModel):
    store_id: str
    name: str
    source: str  # RTSP URL, file path, or webcam ID
    ai_services: List[str] = ["people_counting", "behavior_detection"]
    model_name: str = "yolov8n.pt"
    device: str = "auto"  # "auto", "cuda", "cpu"
    conf_thresh: float = 0.5
    iou_thresh: float = 0.45
    max_det: int = 300
    skip_frame: int = 3


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    source: Optional[str] = None  # RTSP URL, file path, or webcam ID
    ai_services: Optional[List[str]] = None
    model_name: Optional[str] = None
    device: Optional[str] = None
    conf_thresh: Optional[float] = None
    iou_thresh: Optional[float] = None
    max_det: Optional[int] = None
    skip_frame: Optional[int] = None
    is_active: Optional[bool] = None


class CountingZone(BaseModel):
    id: str
    camera_id: str
    name: str
    polygon: List[List[int]]  # [[x1,y1], [x2,y2], ...]
    is_active: bool = True


class CountingZoneCreate(BaseModel):
    camera_id: str
    name: str
    polygon: List[List[int]]
    is_active: bool = True


class CountingZoneUpdate(BaseModel):
    name: Optional[str] = None
    polygon: Optional[List[List[int]]] = None
    is_active: Optional[bool] = None


class CountingLine(BaseModel):
    id: str
    camera_id: str
    name: str
    p1: List[int]  # [x, y]
    p2: List[int]  # [x, y]
    is_active: bool = True


class CountingLineCreate(BaseModel):
    camera_id: str
    name: str
    p1: List[int]
    p2: List[int]
    is_active: bool = True


class CountingLineUpdate(BaseModel):
    name: Optional[str] = None
    p1: Optional[List[int]] = None
    p2: Optional[List[int]] = None
    is_active: Optional[bool] = None


class TaskConfig(BaseModel):
    zones: List[CountingZone] = []
    lines: List[CountingLine] = []


class TaskSetRequest(BaseModel):
    task_type: str  # "zone", "line", or "both"
    zones: Optional[List[CountingZoneCreate]] = None
    lines: Optional[List[CountingLineCreate]] = None


