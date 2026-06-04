from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class Token(BaseModel):
    access_token: str
    token_type: str
    is_admin: bool = False

class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    is_admin: bool
    api_key: Optional[str] = None
    valid_until: Optional[datetime] = None

class UserCreateAdmin(UserCreate):
    is_admin: bool = False
    valid_until: Optional[datetime] = None

class WeightNode(BaseModel):
    """
    Schema for a bottom-up branch node configuration.
    Includes min/max bounds utilized in SLSQP optimization.
    """
    model_config = ConfigDict(from_attributes=True)

    node_id: str = Field(..., description="Unique identifier for the hierarchical node")
    weight: float = Field(..., description="Reconciliation or allocation weight factor")
    min_weight: Optional[float] = Field(default=None, description="Minimum weight boundary constraint for SLSQP optimization")
    max_weight: Optional[float] = Field(default=None, description="Maximum weight boundary constraint for SLSQP optimization")


class FuelAssignment(BaseModel):
    """
    Schema for an end-use fuel assignment node.
    Includes min/max bounds utilized in SLSQP optimization.
    """
    model_config = ConfigDict(from_attributes=True)

    fuel_id: str = Field(..., description="Identifier of the specific fuel type")
    share: float = Field(..., description="Allocated fractional share of energy consumption")
    min_weight: Optional[float] = Field(default=None, description="Minimum share boundary constraint for SLSQP optimization")
    max_weight: Optional[float] = Field(default=None, description="Maximum share boundary constraint for SLSQP optimization")


class ProjectBase(BaseModel):
    economy: str = Field(..., description="APEC economy code or abbreviation")
    sector_flow: str = Field(..., description="Target sector code or end-use flow category")


class ProjectCreate(ProjectBase):
    base_year: Optional[int] = Field(default=2024, description="Optional base year for initial scenario creation (1990-2022)")


class Project(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ScenarioBase(BaseModel):
    name: Optional[str] = Field(default="Base Year", description="Name of the scenario (defaults to 'Base Year')")
    target_year: int = Field(..., description="Projection target year (1990-2022)")
    tree_state: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Multi-year temporal tree structure, e.g. {'base_year': {...}, '2035': {...}}")
    macro_drivers: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Multi-year macroeconomic target totals, e.g. {'base_year': {...}}")
    active_fuels: Optional[Any] = Field(default=None, description="APEC active leaf-fuels dynamically fetched (array or temporal dict)")
    owner_id: Optional[int] = None


class ScenarioCreate(ScenarioBase):
    pass


class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    target_year: Optional[int] = None
    tree_state: Optional[Dict[str, Any]] = None
    macro_drivers: Optional[Dict[str, Any]] = None


class Scenario(ScenarioBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int


class StatelessTemplateRequest(BaseModel):
    economy: str
    sector_flow: str
    target_year: int = 2024

class StatelessTemplateResponse(BaseModel):
    tree_state: Dict[str, Any]
    macro_drivers: Dict[str, Any]
    active_fuels: List[Any]

class StatelessOptimizeRequest(BaseModel):
    tree_state: Dict[str, Any]
    target_total: float = 100.0
    macro_drivers: Dict[str, Any] = Field(default_factory=dict)
    active_fuels: List[Any] = Field(default_factory=list)

class ScenarioImport(BaseModel):
    economy: str = Field(..., description="APEC economy code")
    sector_flow: str = Field(..., description="Target sector code")
    scenario_name: str = Field(..., description="Scenario name")
    target_year: int = Field(..., description="Target year")
    macro_drivers: Dict[str, Any] = Field(default_factory=dict, description="Multi-year macro drivers map")
    tree_state: Dict[str, Any] = Field(..., description="Multi-year tree state structure")
    telemetry: Optional[Dict[str, Any]] = None

