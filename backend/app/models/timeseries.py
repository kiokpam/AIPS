from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.models import Base


class PeopleCount(Base):
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


