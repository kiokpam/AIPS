from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.models import Base


class PeopleCount(Base):
    __tablename__ = "people_counts"

    time: Mapped[str] = mapped_column(DateTime, primary_key=True)
    store_id: Mapped[str] = mapped_column(String, primary_key=True)
    zone_id: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[int] = mapped_column(Integer, nullable=False)


