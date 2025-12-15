"""
Notification Models
Pydantic models for notification requests
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class NotificationRequest(BaseModel):
    org_id: Optional[str] = None  # Optional for system emails (password reset)
    user_id: Optional[str] = None
    alert_id: Optional[str] = None
    type: str  # "alert", "system", "password_reset"
    channels: List[str]  # ["websocket", "telegram", "email"]
    data: Dict[str, Any]


class TelegramVideoRequest(BaseModel):
    video_path: str
    caption: str
    chat_id: Optional[str] = None


class TelegramMessageRequest(BaseModel):
    message: str
    chat_id: Optional[str] = None
    parse_mode: str = "HTML"

