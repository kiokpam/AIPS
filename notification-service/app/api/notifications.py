"""
Notification API Endpoints
REST API for sending notifications
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from ..models.notification import NotificationRequest, TelegramVideoRequest, TelegramMessageRequest
from ..services.notification_router import notification_router
from ..services.telegram_service import telegram_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/send")
async def send_notification(request: NotificationRequest):
    """Send notification through specified channels"""
    try:
        results = await notification_router.send_notification(request.dict())
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/telegram/video")
async def send_telegram_video(request: TelegramVideoRequest):
    """Send video to Telegram (direct endpoint)"""
    success = telegram_service.send_video(
        video_path=request.video_path,
        caption=request.caption,
        chat_id=request.chat_id
    )
    return {"status": "success" if success else "failed"}


@router.post("/telegram/message")
async def send_telegram_message(request: TelegramMessageRequest):
    """Send text message to Telegram (direct endpoint)"""
    success = telegram_service.send_message(
        message=request.message,
        chat_id=request.chat_id,
        parse_mode=request.parse_mode
    )
    return {"status": "success" if success else "failed"}


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "notification-service"}

