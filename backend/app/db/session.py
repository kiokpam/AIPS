import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


# The fallback matches the DEV-ONLY Postgres credentials in docker-compose.yml.
# Always set DATABASE_URL explicitly outside local development.
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://aips:aips@localhost:5432/aips")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


