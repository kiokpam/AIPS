from pydantic import BaseModel


class Store(BaseModel):
    id: str
    name: str


class StoreCreate(BaseModel):
    name: str


class Camera(BaseModel):
    id: str
    store_id: str
    name: str
    rtsp_url: str | None = None


class CameraCreate(BaseModel):
    store_id: str
    name: str
    rtsp_url: str | None = None


