from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# Import all models so they're registered with Base.metadata
# This ensures create_all() creates all tables
from app.models.core import *  # noqa: F401, F403, E402
from app.models.timeseries import *  # noqa: F401, F403, E402

