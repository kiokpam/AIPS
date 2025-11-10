from sqlalchemy import String, ForeignKey, JSON, Integer, Float, Boolean, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.models import Base


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False, unique=True)  # RTSP URL, file path, or webcam ID
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


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    type: Mapped[str] = mapped_column(String, nullable=False)  # 'system' | 'anomaly'
    severity: Mapped[str] = mapped_column(String, nullable=False)  # 'low' | 'medium' | 'high'
    message: Mapped[str] = mapped_column(Text, nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), nullable=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=True)
    anomaly_type: Mapped[str] = mapped_column(String, nullable=True)  # 'fighting', 'theft', etc.
    confidence: Mapped[float] = mapped_column(Float, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class VideoClip(Base):
    __tablename__ = "video_clips"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    anomaly_type: Mapped[str] = mapped_column(String, nullable=True)
    alert_id: Mapped[str] = mapped_column(ForeignKey("alerts.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


