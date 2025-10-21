from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.api.routes import router as api_router
from app.config.settings import get_settings
from app.models import Base
from app.db.session import engine
import subprocess
import sys
import os
from pathlib import Path


class HealthResponse(BaseModel):
    status: str


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0")

# Will hold subprocess for AI service when started from this process
_ai_process = None


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(",") if settings.cors_origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_text()
            await websocket.send_text(message)
    except WebSocketDisconnect:
        return


app.include_router(api_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.on_event("startup")
def start_ai_service() -> None:
    """Start the Flask-based AI service as a subprocess (if not already running).

    This attempts to run: python <repo_root>/ai/people-counting/app.py
    """
    global _ai_process
    if _ai_process is not None:
        return

    repo_root = Path(__file__).resolve().parents[3]
    ai_app = repo_root / 'ai' / 'people-counting' / 'app.py'
    if not ai_app.exists():
        # Nothing to start
        return

    python_exe = os.environ.get('AIPS_PYTHON', sys.executable or 'python')
    try:
        # Start AI service on port 5001
        _ai_process = subprocess.Popen([python_exe, str(ai_app)], cwd=str(ai_app.parent))
    except Exception:
        _ai_process = None


@app.on_event("shutdown")
def stop_ai_service() -> None:
    """Terminate AI subprocess started on startup."""
    global _ai_process
    try:
        if _ai_process is not None:
            _ai_process.terminate()
            _ai_process.wait(timeout=5)
    except Exception:
        pass
    _ai_process = None


