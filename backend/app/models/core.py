import enum
from datetime import datetime
from sqlalchemy import (
    String,
    ForeignKey,
    JSON,
    Integer,
    Float,
    Boolean,
    DateTime,
    Text,
    Enum as SqlEnum,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.models import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    join_code: Mapped[str] = mapped_column(String, nullable=True, unique=True, index=True)  # Optional join code
    member_password_hash: Mapped[str] = mapped_column(String, nullable=True)  # Shared password for all members
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MembershipRole(str, enum.Enum):
    manager = "manager"
    member = "member"


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "org_id", name="uq_memberships_user_org"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[MembershipRole] = mapped_column(SqlEnum(MembershipRole, name="membershiprole"), nullable=False, default=MembershipRole.member)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


class Camera(Base):
    __tablename__ = "cameras"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)  # RTSP URL, file path, or webcam ID
    ai_services: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    model_name: Mapped[str] = mapped_column(String, nullable=True, default=None)  # Optional - AI services not implemented yet
    device: Mapped[str] = mapped_column(String, nullable=True, default=None)  # Optional - AI services not implemented yet
    conf_thresh: Mapped[float] = mapped_column(Float, nullable=True, default=None)  # Optional - AI services not implemented yet
    iou_thresh: Mapped[float] = mapped_column(Float, nullable=True, default=None)  # Optional - AI services not implemented yet
    max_det: Mapped[int] = mapped_column(Integer, nullable=True, default=None)  # Optional - AI services not implemented yet
    skip_frame: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


class CountingZone(Base):
    __tablename__ = "counting_zones"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    polygon: Mapped[list] = mapped_column(JSON, nullable=False)  # [[x1,y1], [x2,y2], ...]
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


class CountingLine(Base):
    __tablename__ = "counting_lines"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    p1: Mapped[list] = mapped_column(JSON, nullable=False)  # [x, y]
    p2: Mapped[list] = mapped_column(JSON, nullable=False)  # [x, y]
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


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
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


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
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    token: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=True)  # Optional: specific email invite
    role: Mapped[MembershipRole] = mapped_column(SqlEnum(MembershipRole, name="membershiprole"), nullable=False, default=MembershipRole.member)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # Optional expiration
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # When invite was used
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MemberPermission(Base):
    __tablename__ = "member_permissions"
    __table_args__ = (
        UniqueConstraint("membership_id", "camera_id", name="uq_member_permission_camera"),
        UniqueConstraint("membership_id", "store_id", name="uq_member_permission_store"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    membership_id: Mapped[str] = mapped_column(ForeignKey("memberships.id", ondelete="CASCADE"), nullable=False, index=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.id", ondelete="CASCADE"), nullable=True, index=True)  # NULL means org-wide access, set means store-specific access
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id", ondelete="CASCADE"), nullable=True, index=True)  # NULL means dashboard/store access permission
    can_view: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


