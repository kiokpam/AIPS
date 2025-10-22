import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.core import Camera as CameraModel
from app.schemas.core import Camera, CameraCreate


router = APIRouter(prefix="/cameras", tags=["cameras"])

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/", response_model=List[Camera])
def list_cameras(db: Session = Depends(get_db)) -> list[Camera]:
    rows = db.query(CameraModel).all()
    return [Camera(id=r.id, store_id=r.store_id, name=r.name, rtsp_url=r.rtsp_url) for r in rows]


@router.post("/", response_model=Camera)
def create_camera(payload: CameraCreate, db: Session = Depends(get_db)) -> Camera:
    item = CameraModel(id=str(uuid.uuid4()), store_id=payload.store_id, name=payload.name, rtsp_url=payload.rtsp_url)
    db.add(item)
    db.commit()
    return Camera(id=item.id, store_id=item.store_id, name=item.name, rtsp_url=item.rtsp_url)


