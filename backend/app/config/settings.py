from functools import lru_cache
from pydantic import BaseModel
from typing import Optional
import logging
import os


logger = logging.getLogger(__name__)

# Development-only JWT signing secret. It is public (it is in this file), so
# anyone could forge login tokens with it. Set JWT_SECRET in any real deployment.
DEV_JWT_SECRET = "dev-secret-change-me"

# Values that must never be used to sign tokens outside local development
# (the built-in fallback and the placeholder from .env.example).
INSECURE_JWT_SECRETS = {DEV_JWT_SECRET, "change-me"}

# Values of ENV that mean "production": the backend refuses to start there
# without a real JWT_SECRET.
PRODUCTION_ENV_NAMES = {"production", "prod"}


class Settings(BaseModel):
    app_name: str = "AIPS Backend API"
    environment: str = os.getenv("ENV", "dev")
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    jwt_secret: str = os.getenv("JWT_SECRET") or DEV_JWT_SECRET
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expires_seconds: int = int(os.getenv("JWT_EXPIRES_SECONDS", "2592000"))  # 30 days = 1 month

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


def validate_jwt_secret(settings: Settings) -> None:
    """Refuse an insecure JWT secret in production; warn loudly in development."""
    if settings.jwt_secret not in INSECURE_JWT_SECRETS:
        return

    if settings.environment.strip().lower() in PRODUCTION_ENV_NAMES:
        raise RuntimeError(
            f"JWT_SECRET is not set (or uses a placeholder value) while ENV={settings.environment}. "
            "Refusing to start: anyone could forge login tokens. "
            "Set JWT_SECRET to a long random value, for example the output of "
            "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"`."
        )

    logger.warning(
        "\n" + "!" * 78 + "\n"
        "  SECURITY WARNING: JWT_SECRET is not set (or uses a placeholder value).\n"
        "  Login tokens are signed with a publicly known development secret.\n"
        "  This is fine for local development only. Set JWT_SECRET before\n"
        "  deploying; with ENV=production the backend refuses to start without it.\n"
        + "!" * 78
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    validate_jwt_secret(settings)
    return settings
