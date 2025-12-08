"""
Notification Service Main Application
FastAPI application for handling all notifications
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
from .config.settings import get_settings
from .api import notifications, ws
from .services.email_service import email_service
from .services.telegram_service import telegram_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="AIPS Notification Service - Handles WebSocket, Email, and Telegram notifications"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(notifications.router)
app.include_router(ws.router)


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting Notification Service...")
    
    # Initialize email service
    email_service.initialize(
        provider=settings.email_provider,
        frontend_url=settings.frontend_url,
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        smtp_username=settings.smtp_username,
        smtp_password=settings.smtp_password,
        smtp_use_tls=settings.smtp_use_tls,
        sendgrid_api_key=settings.sendgrid_api_key,
        from_email=settings.email_from_address,
        from_name=settings.email_from_name
    )
    
    # Initialize telegram service
    telegram_service.__init__(
        bot_token=settings.telegram_bot_token,
        default_chat_id=settings.telegram_chat_id,
        max_retries=settings.telegram_max_retries,
        retry_delay=settings.telegram_retry_delay
    )
    
    logger.info("Notification Service started successfully")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "notification-service",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)

