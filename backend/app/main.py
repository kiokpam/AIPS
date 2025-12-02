from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.api.routes import router as api_router
from app.config.settings import get_settings
from app.models import Base
from app.db.session import engine


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


@app.on_event("startup")
def on_startup() -> None:
    """Initialize database and services on startup"""
    import time
    max_retries = 10
    retry_delay = 2
    
    # Initialize database
    for attempt in range(max_retries):
        try:
            Base.metadata.create_all(bind=engine)
            print("✅ Database connection established and tables created")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"⚠️ Database not ready (attempt {attempt + 1}/{max_retries}), retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                print(f"❌ Failed to connect to database after {max_retries} attempts: {e}")
                # Don't raise - let the app start and retry on first request
                print("⚠️ Application will start but database operations may fail until connection is established")
    
    # Initialize email service
    try:
        from app.services.email_service import email_service
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
            from_name=settings.email_from_name,
        )
        print(f"✅ Email service initialized (provider: {settings.email_provider})")
    except Exception as e:
        print(f"⚠️ Email service initialization failed: {e}")
        print("⚠️ Password reset emails will not be sent")


