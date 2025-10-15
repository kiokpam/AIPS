from functools import lru_cache
from pydantic import BaseModel
import os


class Settings(BaseModel):
    app_name: str = "AIPS Backend API"
    environment: str = os.getenv("ENV", "dev")
    cors_origins: str = os.getenv("CORS_ORIGINS", "*")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


