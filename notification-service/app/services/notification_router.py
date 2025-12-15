"""
Notification Router
Routes notifications to appropriate channels (WebSocket, Email, Telegram)
"""

from typing import List, Dict, Any, Optional
import logging
import httpx
import os
from .websocket_manager import ws_manager
from .email_service import email_service
from .telegram_service import TelegramService

logger = logging.getLogger(__name__)

# Backend URL from environment
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


class NotificationRouter:
    """Routes notifications to all channels (WebSocket, Telegram, Email)"""
    
    def __init__(
        self,
        ws_manager_instance,
        email_service_instance
    ):
        self.ws_manager = ws_manager_instance
        self.email_service = email_service_instance
    
    async def send_notification(
        self,
        notification_request: Dict[str, Any]
    ) -> Dict[str, bool]:
        """
        Send notification through requested channels.
        
        Args:
            notification_request: {
                "org_id": "string",  # Required for Telegram
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
        
        # Telegram notification - fetch settings from Backend API
        if "telegram" in channels and org_id:
            try:
                # Fetch Telegram settings from Backend
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"{BACKEND_URL}/api/telegram/settings",
                        headers={"X-Org-ID": org_id},
                        timeout=5.0
                    )
                    
                    if response.status_code == 200:
                        telegram_settings = response.json()
                        
                        # Check if Telegram is enabled for this org
                        if telegram_settings.get("enabled"):
                            # Prepare alert message
                            alert_data = data.get("alert", {})
                            behavior = alert_data.get("anomaly_type", "unknown")
                            camera_name = alert_data.get("camera_name", "Unknown")
                            confidence = alert_data.get("confidence", 0)
                            timestamp = alert_data.get("timestamp", "")
                            
                            # Format message
                            message = f"""
🚨 CẢNH BÁO BẤT THƯỜNG

📹 Camera: {camera_name}
⚠️ Hành vi: {behavior.upper()}
📊 Độ tin cậy: {confidence:.1%}
⏰ Thời gian: {timestamp}
                            """.strip()
                            
                            # Get video path
                            video_path = data.get("video_path")
                            
                            # Send to Telegram
                            success = await TelegramService.send_alert_with_video(
                                bot_token=telegram_settings["bot_token"],
                                chat_id=telegram_settings["chat_id"],
                                message=message,
                                video_path=video_path
                            )
                            results["telegram"] = success
                        else:
                            logger.info(f"Telegram notifications disabled for org {org_id}")
                            results["telegram"] = False
                    elif response.status_code == 404:
                        logger.info(f"Telegram not configured for org {org_id}")
                        results["telegram"] = False
                    else:
                        logger.error(f"Failed to fetch Telegram settings: HTTP {response.status_code}")
                        results["telegram"] = False
                        
            except httpx.TimeoutException:
                logger.error("Timeout fetching Telegram settings from Backend")
                results["telegram"] = False
            except Exception as e:
                logger.error(f"Telegram notification failed: {e}")
                results["telegram"] = False
        elif "telegram" in channels and not org_id:
            logger.warning("Telegram notification requires org_id")
            results["telegram"] = False
        
        return results


# Global instance
notification_router = NotificationRouter(ws_manager, email_service)
