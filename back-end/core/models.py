from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Boolean, DateTime
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    """
    Represents a registered user in the authentication system.
    """
    __tablename__ = "users"

    id: int = Column(Integer, primary_key=True, index=True)
    username: str = Column(String(100), unique=True, index=True, nullable=False)
    email: str = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password: str = Column(String(255), nullable=False)
    is_active: bool = Column(Boolean, default=True)
    is_admin: bool = Column(Boolean, default=False)
    api_key: str = Column(String(255), unique=True, index=True, nullable=True)
    valid_until = Column(DateTime, nullable=True)

    # Relationships
    scenarios = relationship("Scenario", back_populates="owner")


class Project(Base):
    """
    Represents an energy system project matching a specific economy and sector flow.
    """
    __tablename__ = "projects"

    id: int = Column(Integer, primary_key=True, index=True)
    economy: str = Column(String(100), nullable=False)
    sector_flow: str = Column(String(100), nullable=False)

    # Relationships
    scenarios = relationship("Scenario", back_populates="project", cascade="all, delete-orphan")


class Scenario(Base):
    """
    Represents a specific simulation scenario under a project, keeping track of 
    reconciliation weights, target year, tree structures, and macro multipliers.
    """
    __tablename__ = "scenarios"

    id: int = Column(Integer, primary_key=True, index=True)
    project_id: int = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name: str = Column(String(255), nullable=False)
    target_year: int = Column(Integer, nullable=False)
    tree_state: dict = Column(JSON, nullable=True)  # Holds the bottom-up hierarchy and nodes
    macro_drivers: dict = Column(JSON, nullable=True)  # Holds macroeconomic control variables
    owner_id: int = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="scenarios")
    owner = relationship("User", back_populates="scenarios")
