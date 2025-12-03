from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models import Base


class PeopleCount(Base):
    """Zone-based people count (current count in zone)."""
    __tablename__ = "people_counts"

    time: Mapped[str] = mapped_column(DateTime, primary_key=True)
    store_id: Mapped[str] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"),
        String,
        primary_key=True
    )
    zone_id: Mapped[str] = mapped_column(
        ForeignKey("counting_zones.id", ondelete="RESTRICT"),  # Prevent deletion if historical data exists
        String,
        primary_key=True
    )
    value: Mapped[int] = mapped_column(Integer, nullable=False)
    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        String,
        nullable=False
    )


class InOutCount(Base):
    """
    In/Out counting data from AI service.
    
    Tracks cumulative IN and OUT counts for each camera.
    AI detects crossings between Line A and Line B:
    - A→B crossing = OUT (exiting)
    - B→A crossing = IN (entering)
    """
    __tablename__ = "inout_counts"

    time: Mapped[str] = mapped_column(DateTime, primary_key=True)
    camera_id: Mapped[str] = mapped_column(
        ForeignKey("cameras.id", ondelete="CASCADE"),
        String,
        primary_key=True
    )
    store_id: Mapped[str] = mapped_column(
        ForeignKey("stores.id", ondelete="CASCADE"),
        String,
        nullable=False
    )
    count_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    count_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        String,
        nullable=False
    )


