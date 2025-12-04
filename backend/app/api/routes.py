from fastapi import APIRouter
from app.api.auth import router as auth_router
from app.api.stores import router as stores_router
from app.api.cameras import router as cameras_router
from app.api.events import router as events_router
from app.api.preview import router as preview_router
from app.api.system import router as system_router
from app.api.upload import router as upload_router
from app.api.ai_integration import router as ai_integration_router
from app.api.clips import router as clips_router
from app.api.ws import router as websocket_router

router = APIRouter()


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}

router.include_router(auth_router)
router.include_router(stores_router)
router.include_router(cameras_router)
router.include_router(events_router)
router.include_router(preview_router)
router.include_router(system_router)
router.include_router(upload_router)
router.include_router(ai_integration_router)
router.include_router(clips_router)
router.include_router(websocket_router)


