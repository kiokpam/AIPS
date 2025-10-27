from sqlalchemy import String, ForeignKey, JSON, Integer, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.models import Base


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)  # RTSP URL, file path, or webcam ID
    ai_services: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    model_name: Mapped[str] = mapped_column(String, nullable=False, default="yolov8n.pt")
    device: Mapped[str] = mapped_column(String, nullable=False, default="auto")
    conf_thresh: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    iou_thresh: Mapped[float] = mapped_column(Float, nullable=False, default=0.45)
    max_det: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    skip_frame: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CountingZone(Base):
    __tablename__ = "counting_zones"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    polygon: Mapped[list] = mapped_column(JSON, nullable=False)  # [[x1,y1], [x2,y2], ...]
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CountingLine(Base):
    __tablename__ = "counting_lines"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    p1: Mapped[list] = mapped_column(JSON, nullable=False)  # [x, y]
    p2: Mapped[list] = mapped_column(JSON, nullable=False)  # [x, y]
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


