from fastapi import APIRouter
from app.api.auth import router as auth_router
from app.api.stores import router as stores_router
from app.api.cameras import router as cameras_router
from app.api.events import router as events_router
from app.api.ai_proxy import router as ai_router

router = APIRouter()


@router.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}

router.include_router(auth_router)
router.include_router(stores_router)
router.include_router(cameras_router)
router.include_router(events_router)
router.include_router(ai_router)


