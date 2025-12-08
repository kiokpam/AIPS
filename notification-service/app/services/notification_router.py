"""
Notification Router
Routes notifications to appropriate channels (WebSocket, Email, Telegram)
"""

from typing import List, Dict, Any, Optional
import logging
from .websocket_manager import ws_manager
from .email_service import email_service
from .telegram_service import telegram_service

logger = logging.getLogger(__name__)


class NotificationRouter:
    """Routes notifications to all channels (WebSocket, Telegram, Email)"""
    
    def __init__(
        self,
        ws_manager_instance,
        email_service_instance,
        telegram_service_instance
    ):
        self.ws_manager = ws_manager_instance
        self.email_service = email_service_instance
        self.telegram_service = telegram_service_instance
    
    async def send_notification(
        self,
        notification_request: Dict[str, Any]
    ) -> Dict[str, bool]:
        """
        Send notification through requested channels.
        
        Args:
            notification_request: {
                "org_id": "string",  # Optional for system emails
                "user_id": "string",  # Optional, for user-specific notifications
                "alert_id": "string",
                "type": "alert|system|password_reset",
                "channels": ["websocket", "email", "telegram"],
                "data": {
                    "alert": {...},
                    "store_name": "...",
                    "camera_name": "...",
                    "video_path": "...",  # For Telegram video
                    "message": "...",
                    "to_email": "...",  # For email
                    "subject": "...",  # For email
                    "html_content": "...",  # For email
                    "text_content": "...",  # For email (optional)
                    "telegram_chat_id": "..."  # Optional, uses default if not provided
                }
            }
        
        Returns:
            Dict with channel success status: {"websocket": True, "email": False, ...}
        """
        channels = notification_request.get("channels", ["websocket"])
        org_id = notification_request.get("org_id")
        user_id = notification_request.get("user_id")
        data = notification_request.get("data", {})
        
        results = {}
        
        # WebSocket notification (for frontend)
        if "websocket" in channels:
            if not org_id:
                logger.warning("WebSocket notification requires org_id")
                results["websocket"] = False
            else:
                try:
                    if user_id:
                        await self.ws_manager.send_to_user(org_id, user_id, data)
                    else:
                        await self.ws_manager.broadcast(org_id, data)
                    results["websocket"] = True
                except Exception as e:
                    logger.error(f"WebSocket notification failed: {e}")
                    results["websocket"] = False
        
        # Email notification (for password reset, alerts, etc.)
        if "email" in channels:
            try:
                to_email = data.get("to_email")
                subject = data.get("subject", "Notification")
                html_content = data.get("html_content", "")
                text_content = data.get("text_content")
                
                if not to_email:
                    logger.error("Email address not provided")
                    results["email"] = False
                else:
                    success = self.email_service.send_email(
                        to_email=to_email,
                        subject=subject,
                        html_content=html_content,
                        text_content=text_content
                    )
                    results["email"] = success
            except Exception as e:
                logger.error(f"Email notification failed: {e}")
                results["email"] = False
        
        # Telegram notification
        if "telegram" in channels:
            try:
                video_path = data.get("video_path")
                message = data.get("message", "Alert notification")
                telegram_chat_id = data.get("telegram_chat_id")
                
                if video_path:
                    # Send video (from record.py functionality)
                    success = self.telegram_service.send_video(
                        video_path=video_path,
                        caption=message,
                        chat_id=telegram_chat_id
                    )
                else:
                    # Send text message
                    success = self.telegram_service.send_message(
                        message=message,
                        chat_id=telegram_chat_id
                    )
                results["telegram"] = success
            except Exception as e:
                logger.error(f"Telegram notification failed: {e}")
                results["telegram"] = False
        
        return results


# Global instance
notification_router = NotificationRouter(ws_manager, email_service, telegram_service)

