from pydantic import BaseModel, EmailStr
from typing import List, Optional, Literal
from datetime import datetime
from app.schemas.auth import UserInfo


class Store(BaseModel):
    id: str
    name: str
    org_id: str


class StoreCreate(BaseModel):
    name: str


class StoreMemberAccountCreate(BaseModel):
    username: str
    password: str
    camera_ids: List[str] = []
    can_access_dashboard: bool = True


class StoreMemberAccountUpdate(BaseModel):
    camera_ids: List[str] = []
    can_access_dashboard: bool = True
    password: Optional[str] = None


class StoreMemberAccountResponse(BaseModel):
    message: str
    user: UserInfo
    username: str
    store_id: str
    store_name: str


class StoreMemberCameraAccess(BaseModel):
    camera_id: str
    camera_name: Optional[str] = None


class StoreMemberAccountSummary(BaseModel):
    membership_id: str
    user_id: str
    username: str
    email: EmailStr
    store_id: str
    store_name: str
    can_access_dashboard: bool
    camera_access: List[StoreMemberCameraAccess] = []
    created_at: datetime


class Camera(BaseModel):
    id: str
    store_id: str
    name: str
    source: str  # RTSP URL, file path, or webcam ID
    ai_services: List[str] = ["people_counting", "behavior_detection"]
    # Model configuration removed - AI services will handle all model settings
    skip_frame: int = 3
    is_active: bool = True
    org_id: str


class CameraCreate(BaseModel):
    store_id: str
    name: str
    source: str  # RTSP URL only
    ai_services: List[str] = ["people_counting", "behavior_detection"]
    # Model configuration removed - AI services will handle all model settings
    skip_frame: int = 3


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    source: Optional[str] = None  # RTSP URL only
    ai_services: Optional[List[str]] = None
    # Model configuration removed - AI services will handle all model settings
    skip_frame: Optional[int] = None
    is_active: Optional[bool] = None


class CountingZone(BaseModel):
    id: str
    camera_id: str
    name: str
    polygon: List[List[float]]  # [[x1,y1], [x2,y2], ...]
    is_active: bool
    org_id: str


class CountingZoneCreate(BaseModel):
    camera_id: str
    name: str
    polygon: List[List[float]]  # [[x1,y1], [x2,y2], ...]
    is_active: bool = True


class CountingZoneUpdate(BaseModel):
    name: Optional[str] = None
    polygon: Optional[List[List[float]]] = None
    is_active: Optional[bool] = None


class CountingLine(BaseModel):
    id: str
    camera_id: str
    name: str
    p1: List[float]  # [x, y]
    p2: List[float]  # [x, y]
    is_active: bool
    org_id: str


class CountingLineCreate(BaseModel):
    camera_id: str
    name: str
    p1: List[float]  # [x, y]
    p2: List[float]  # [x, y]
    is_active: bool = True


class CountingLineUpdate(BaseModel):
    name: Optional[str] = None
    p1: Optional[List[float]] = None
    p2: Optional[List[float]] = None
    is_active: Optional[bool] = None


class TaskConfig(BaseModel):
    zones: List[CountingZone] = []
    lines: List[CountingLine] = []
    current_count: int = 0


class TaskSetRequest(BaseModel):
    task_type: Literal["zone", "line", "both"] = "zone"
    zones: Optional[List[CountingZoneCreate]] = None
    lines: Optional[List[CountingLineCreate]] = None
