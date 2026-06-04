import os
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Allow environment override for databases like MariaDB/MySQL or default to local SQLite
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./energy_modeler.db")

# SQLite connection arguments
connect_args: dict = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a transactional database session context.
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
