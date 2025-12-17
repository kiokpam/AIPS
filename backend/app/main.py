"""
AIPS Backend Application

FastAPI backend service for the AI-Powered Store Surveillance System.
Handles camera management, video streaming, AI integration, and API endpoints.
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.api.routes import router as api_router
from app.api import telegram
from app.api import ws
from app.config.settings import get_settings
from app.models import Base
from app.db.session import engine

logger = logging.getLogger(__name__)


class HealthResponse(BaseModel):
    status: str


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")

# Configure CORS: if wildcard is used, disable credentials per CORS spec
raw_origins = settings.cors_origins or "http://localhost:3000"
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
use_wildcard = len(origins) == 1 and origins[0] == "*"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if use_wildcard else origins,
    allow_credentials=False if use_wildcard else True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


app.include_router(api_router, prefix="/api")
app.include_router(ws.router, prefix="/api")
app.include_router(telegram.router)  # Telegram router already has /api/telegram prefix


@app.on_event("startup")
def on_startup() -> None:
    """Initialize database and services on startup"""
    import os
    import time
    
    # Skip DB initialization during tests
    if os.getenv('SKIP_DB_INIT') == '1':
        logger.info("Skipping database initialization (test mode)")
        return
    
    max_retries = 10
    retry_delay = 2
    
    # Initialize database
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Database connection established and tables created")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"Database not ready (attempt {attempt + 1}/{max_retries}), retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                logger.error(f"Failed to connect to database after {max_retries} attempts: {e}")
                # Don't raise - let the app start and retry on first request
                logger.warning("Application will start but database operations may fail until connection is established")

    # Email service is now handled by notification service
    logger.info("Email notifications are handled by notification service")
    
    # Auto-restore active cameras from database
    try:
        from app.db.session import SessionLocal
        from app.models.core import Camera as CameraModel
        from app.services.camera_manager import camera_manager
        
        db = SessionLocal()
        try:
            # Get all cameras that were marked as active
            active_cameras = db.query(CameraModel).filter(CameraModel.is_active == True).all()
            
            if active_cameras:
                logger.info(f"Restoring {len(active_cameras)} active camera(s)...")
                
                restored = 0
                failed = 0
                for camera in active_cameras:
                    try:
                        # Add small delay between restores to avoid resource conflicts
                        if restored > 0:
                            time.sleep(0.5)
                        
                        success = camera_manager.add_camera(
                            camera_id=camera.id,
                            store_id=camera.store_id,
                            source=camera.source,
                            name=camera.name,
                            ai_services=camera.ai_services or ["people_counting", "behavior_detection"],
                            skip_frame=camera.skip_frame or 3,
                        )
                        
                        if success:
                            restored += 1
                            logger.info(f"Camera '{camera.name}' restored")
                        else:
                            # Mark as inactive if can't restore
                            camera.is_active = False
                            db.commit()
                            failed += 1
                            logger.warning(f"Camera '{camera.name}' failed to restore (marked inactive)")
                    except Exception as cam_err:
                        camera.is_active = False
                        db.commit()
                        failed += 1
                        logger.error(f"Camera '{camera.name}' error: {cam_err}")
                
                logger.info(f"Camera restore complete: {restored} restored, {failed} failed")
            else:
                logger.info("No active cameras to restore")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Camera auto-restore failed: {e}")
        logger.warning("Cameras can be started manually from the UI")


