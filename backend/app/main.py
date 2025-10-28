from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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


