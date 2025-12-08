"""
Telegram Service
Handles sending notifications via Telegram bot.
Extracted from record.py
"""

import os
import requests
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class TelegramService:
    """Telegram notification service extracted from record.py"""
    
    def __init__(
        self,
        bot_token: Optional[str] = None,
        default_chat_id: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: int = 5,
        timeout: int = 30
    ):
        self.bot_token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN")
        self.default_chat_id = default_chat_id or os.getenv("TELEGRAM_CHAT_ID")
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.timeout = timeout
        
        if not self.bot_token:
            logger.warning("Telegram bot token not configured")
    
    def send_video(
        self,
        video_path: str,
        caption: str = "Alert notification",
        chat_id: Optional[str] = None,
        delete_after_send: bool = True
    ) -> bool:
        """
        Send video to Telegram with retry mechanism.
        Extracted from record.py's send_telegram_video method.
        
        Args:
            video_path: Path to video file
            caption: Message caption
            chat_id: Telegram chat ID (uses default if not provided)
            delete_after_send: Whether to delete video file after sending
            
        Returns:
            True if successful, False otherwise
        """
        if not self.bot_token:
            logger.error("Telegram bot token not configured")
            return False
        
        chat_id = chat_id or self.default_chat_id
        if not chat_id:
            logger.error("Telegram chat ID not configured")
            return False
        
        url = f"https://api.telegram.org/bot{self.bot_token}/sendVideo"
        
        for attempt in range(1, self.max_retries + 1):
            try:
                if not os.path.exists(video_path):
                    logger.error(f"Video file not found: {video_path}")
                    return False
                
                with open(video_path, 'rb') as video_file:
                    files = {'video': video_file}
                    data = {'chat_id': chat_id, 'caption': caption}
                    
                    if attempt > 1:
                        logger.info(f"📤 Retrying Telegram send (attempt {attempt}/{self.max_retries})...")
                    else:
                        logger.info(f"📤 Sending to Telegram...")
                    
                    response = requests.post(url, files=files, data=data, timeout=self.timeout)
                    
                    if response.status_code == 200:
                        logger.info("✅ Telegram message sent successfully")
                        
                        # Clean up video file if requested
                        if delete_after_send:
                            try:
                                os.remove(video_path)
                                logger.debug(f"🗑️ Deleted video file: {video_path}")
                            except Exception as e:
                                logger.warning(f"Could not delete video file {video_path}: {e}")
                        
                        return True
                    else:
                        logger.warning(f"⚠️ Telegram API returned HTTP {response.status_code}: {response.text}")
                        if attempt < self.max_retries:
                            import time
                            time.sleep(self.retry_delay)
                        
            except requests.exceptions.Timeout:
                logger.warning(f"⏱️ Telegram request timeout (attempt {attempt})")
                if attempt < self.max_retries:
                    import time
                    time.sleep(self.retry_delay)
            except Exception as e:
                logger.exception(f"[Telegram] Error (attempt {attempt}): {e}")
                if attempt < self.max_retries:
                    import time
                    time.sleep(self.retry_delay)
        
        logger.error(f"❌ Failed to send Telegram message after {self.max_retries} attempts")
        return False
    
    def send_message(
        self,
        message: str,
        chat_id: Optional[str] = None,
        parse_mode: str = "HTML"
    ) -> bool:
        """
        Send text message to Telegram.
        
        Args:
            message: Text message to send
            chat_id: Telegram chat ID (uses default if not provided)
            parse_mode: Message parse mode (HTML, Markdown, etc.)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.bot_token:
            logger.error("Telegram bot token not configured")
            return False
        
        chat_id = chat_id or self.default_chat_id
        if not chat_id:
            logger.error("Telegram chat ID not configured")
            return False
        
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        
        try:
            data = {
                'chat_id': chat_id,
                'text': message,
                'parse_mode': parse_mode
            }
            
            response = requests.post(url, json=data, timeout=self.timeout)
            
            if response.status_code == 200:
                logger.info("✅ Telegram message sent successfully")
                return True
            else:
                logger.warning(f"⚠️ Telegram API returned HTTP {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            logger.exception(f"[Telegram] Error sending message: {e}")
            return False


# Global instance
telegram_service = TelegramService()

