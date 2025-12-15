from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime


class TelegramSettingsCreate(BaseModel):
    """Schema for creating/updating Telegram settings"""
    bot_token: str = Field(..., min_length=1, description="Telegram Bot Token")
    chat_id: str = Field(..., min_length=1, description="Telegram Chat ID")
    enabled: bool = True


class TelegramSettingsResponse(BaseModel):
    """Schema for Telegram settings response"""
    org_id: str
    bot_token: str  # Will be masked
    chat_id: str
    enabled: bool
    created_at: datetime
    updated_at: datetime
    
    @field_validator('bot_token')
    @classmethod
    def mask_token(cls, v: str) -> str:
        """Mask token for security: show only first 10 and last 4 chars"""
        if len(v) > 14:
            return f"{v[:10]}...{v[-4:]}"
        return "***"
    
    model_config = {"from_attributes": True}


class TelegramTestRequest(BaseModel):
    """Schema for testing Telegram connection"""
    bot_token: str = Field(..., min_length=1)
    chat_id: str = Field(..., min_length=1)


class TelegramTestResponse(BaseModel):
    """Schema for test connection response"""
    success: bool
    message: str
