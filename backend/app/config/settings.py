from functools import lru_cache
from pydantic import BaseModel
from typing import Optional
import os


class Settings(BaseModel):
    app_name: str = "AIPS Backend API"
    environment: str = os.getenv("ENV", "dev")
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expires_seconds: int = int(os.getenv("JWT_EXPIRES_SECONDS", "3600"))
    
    # Frontend URL for email links
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    # Email configuration
    # Provider: "console" (dev), "smtp", or "sendgrid"
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


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


