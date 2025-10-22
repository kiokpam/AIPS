import uuid
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.core import Store as StoreModel
from app.schemas.core import Store, StoreCreate


router = APIRouter(prefix="/stores", tags=["stores"])

def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/", response_model=List[Store])
def list_stores(db: Session = Depends(get_db)) -> list[Store]:
    rows = db.query(StoreModel).all()
    return [Store(id=r.id, name=r.name) for r in rows]


@router.post("/", response_model=Store)
def create_store(payload: StoreCreate, db: Session = Depends(get_db)) -> Store:
    item = StoreModel(id=str(uuid.uuid4()), name=payload.name)
    db.add(item)
    db.commit()
    return Store(id=item.id, name=item.name)


