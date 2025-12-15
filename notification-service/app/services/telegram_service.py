"""
Telegram Service
Handles sending notifications via Telegram bot with dynamic credentials.
"""

import os
import asyncio
import httpx
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class TelegramService:
    """Telegram notification service with dynamic credentials support"""
    
    @staticmethod
    async def send_alert_with_video(
        bot_token: str,
        chat_id: str,
        message: str,
        video_path: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: int = 5
    ) -> bool:
        """
        Send alert message and optional video to Telegram.
        
        Args:
            bot_token: Telegram Bot Token
            chat_id: Telegram Chat ID
            message: Alert message text
            video_path: Optional path to video file
            max_retries: Number of retry attempts
            retry_delay: Delay between retries in seconds
            
        Returns:
            True if successful, False otherwise
        """
        # Send text message first
        try:
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json={"chat_id": chat_id, "text": message},
                    timeout=10.0
                )
                
                if response.status_code != 200:
                    logger.error(f"Failed to send Telegram message: {response.text}")
                    return False
                    
                logger.info("✅ Telegram message sent successfully")
                
        except Exception as e:
            logger.error(f"Error sending Telegram message: {e}")
            return False
        
        # Send video if provided
        if video_path and os.path.exists(video_path):
            for attempt in range(1, max_retries + 1):
                try:
                    url = f"https://api.telegram.org/bot{bot_token}/sendVideo"
                    
                    with open(video_path, 'rb') as video_file:
                        files = {'video': video_file}
                        data = {'chat_id': chat_id}
                        
                        if attempt > 1:
                            logger.info(f"📤 Retrying video send (attempt {attempt}/{max_retries})...")
                        else:
                            logger.info(f"📤 Sending video to Telegram...")
                        
                        async with httpx.AsyncClient() as client:
                            response = await client.post(
                                url,
                                files=files,
                                data=data,
                                timeout=60.0  # Longer timeout for video upload
                            )
                            
                            if response.status_code == 200:
                                logger.info(f"✅ Telegram video sent successfully")
                                return True
                            else:
                                logger.warning(f"⚠️ Telegram video failed: HTTP {response.status_code}")
                                if attempt < max_retries:
                                    await asyncio.sleep(retry_delay)
                
                except Exception as e:
                    logger.error(f"Error sending Telegram video (attempt {attempt}): {e}")
                    if attempt < max_retries:
                        await asyncio.sleep(retry_delay)
            
            logger.error(f"❌ Failed to send video after {max_retries} attempts")
            return False
        
        return True
    
    @staticmethod
    async def send_message(
        bot_token: str,
        chat_id: str,
        message: str,
        parse_mode: str = "HTML"
    ) -> bool:
        """
        Send text message to Telegram.
        
        Args:
            bot_token: Telegram Bot Token
            chat_id: Telegram Chat ID
            message: Text message to send
            parse_mode: Message parse mode (HTML, Markdown, etc.)
            
        Returns:
            True if successful, False otherwise
        """
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    json={
                        'chat_id': chat_id,
                        'text': message,
                        'parse_mode': parse_mode
                    },
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    logger.info("✅ Telegram message sent successfully")
                    return True
                else:
                    logger.warning(f"⚠️ Telegram API returned HTTP {response.status_code}: {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Error sending Telegram message: {e}")
            return False
