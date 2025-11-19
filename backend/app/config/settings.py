from functools import lru_cache
from pydantic import BaseModel
import os


class Settings(BaseModel):
    app_name: str = "AIPS Backend API"
    environment: str = os.getenv("ENV", "dev")
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_expires_seconds: int = int(os.getenv("JWT_EXPIRES_SECONDS", "3600"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


