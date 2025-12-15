"""
Configuration Settings
Environment-based configuration for notification service
"""

from functools import lru_cache
from pydantic import BaseModel
from typing import Optional
import os


class Settings(BaseModel):
    app_name: str = "AIPS Notification Service"
    environment: str = os.getenv("ENV", "dev")
    
    # Backend URL for token verification
    backend_url: str = os.getenv("BACKEND_URL", "http://backend:8000")
    
    # Email configuration
    email_provider: str = os.getenv("EMAIL_PROVIDER", "console")
    email_from_address: str = os.getenv("EMAIL_FROM_ADDRESS", "noreply@aips.local")
    email_from_name: str = os.getenv("EMAIL_FROM_NAME", "AIPS")
    
    # SMTP settings (when EMAIL_PROVIDER=smtp)
    smtp_host: Optional[str] = os.getenv("SMTP_HOST")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: Optional[str] = os.getenv("SMTP_USERNAME")
    smtp_password: Optional[str] = os.getenv("SMTP_PASSWORD")
    smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    
    # SendGrid settings (when EMAIL_PROVIDER=sendgrid)
    sendgrid_api_key: Optional[str] = os.getenv("SENDGRID_API_KEY")
    
    # Telegram configuration
    telegram_bot_token: Optional[str] = os.getenv("TELEGRAM_BOT_TOKEN")
    telegram_chat_id: Optional[str] = os.getenv("TELEGRAM_CHAT_ID")
    telegram_max_retries: int = int(os.getenv("TELEGRAM_MAX_RETRIES", "3"))
    telegram_retry_delay: int = int(os.getenv("TELEGRAM_RETRY_DELAY", "5"))
    
    # Frontend URL for email links
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

