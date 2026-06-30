import io
from typing import List, Optional
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from core.database import get_db
from core.models import Project as ORMProject, Scenario as ORMScenario, User
from core.database import get_db
from core.auth import get_current_user
from core.tree_components import get_template_for_sector, build_dynamic_tree
from core.optimization_engine import optimize_tree_state
from core.leap_exporter import LEAPExporter
from core.data_ingestion import APECDataIngestor
from api import schemas

router = APIRouter()

class OptimizationRequest(BaseModel):
    """
    Optional payload to override or supply the top-down macroeconomic target
    during SLSQP tree reconciliation.
    """
    target_total: Optional[float] = Field(default=None, description="The target sector energy total, e.g. 500.0 PJ")


def attach_active_fuels(scenario: ORMScenario, economy: str, sector_flow: str) -> None:
    """
    Helper function to query active leaf fuels (non-zero) and attach them
    dynamically to the scenario object for payload serialization.
    """
    try:
        ingestor = APECDataIngestor()
        active = ingestor.get_active_fuels(
            economy=economy,
            year=str(scenario.target_year),
            flow=sector_flow
        )
        scenario.active_fuels = active
    except Exception:
        scenario.active_fuels = []


@router.post("/projects", response_model=schemas.Project, status_code=status.HTTP_201_CREATED)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    """
    Creates a new energy modeling project, dynamically queries 19 Total energy 
    to seed the macroeconomic drivers, and pre-populates template leaves.
    """
    # Create main project
    db_project = ORMProject(
        economy=project.economy,
        sector_flow=project.sector_flow
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    # Resolve base year (validate constraints: must match columns between 1990 and 2022)
    by = project.base_year if project.base_year is not None else 2022
    if not (1990 <= by <= 2022):
        by = 2022  # Safe fallback boundary

    # Fetch initial sector template
    tree_state = get_template_for_sector(project.sector_flow)

    # Dynamic ingest macro target total, active fuels, & GDP
    ingestor = APECDataIngestor()
    try:
        target_total = ingestor.get_total_energy(project.economy, str(by), project.sector_flow)
        active_fuels = ingestor.get_active_fuels(project.economy, str(by), project.sector_flow)
        gdp_val = ingestor.get_economy_gdp(project.economy)
    except Exception:
        target_total = 100.0
        active_fuels = []
        gdp_val = 1.0

    # Only dynamically assign active fuels IF AND ONLY IF the returned template is completely empty
    if not tree_state:
        tree_state = build_dynamic_tree(project.sector_flow, project.economy, str(by))
        
    if not tree_state:
        tree_state = {
            "node_id": project.sector_flow,
            "weight": 1.0,
            "min_weight": 0.0,
            "max_weight": 1.0,
            "imbalance_flag": False,
            "children": [],
            "fuels": [
                {
                    "fuel_id": fuel["fuel_id"],
                    "share": round(1.0 / len(active_fuels), 4) if active_fuels else 1.0,
                    "min_weight": 0.0,
                    "max_weight": 1.0
                } for fuel in active_fuels
            ]
        }

    # Create default base year scenario with dynamic target_total and GDP ppp
    db_scenario = ORMScenario(
        project_id=db_project.id,
        name="Base Scenario",
        target_year=by,
        tree_state=tree_state,
        macro_drivers={"target_total": target_total, "total": target_total, "gdp_ppp": gdp_val}
    )
    db.add(db_scenario)
    db.commit()

    return db_project


@router.get("/projects", response_model=List[schemas.Project])
def list_projects(db: Session = Depends(get_db)):
    """
    Lists all projects (utilized in the Initial Welcome Flow to load scenarios).
    """
    return db.query(ORMProject).all()


@router.get("/projects/{id}")
def get_project_details(id: int, db: Session = Depends(get_db)):
    """
    Retrieves full details of a specific project, including all associated scenarios,
    dynamically pre-populating the active fuels matrix for each scenario.
    """
    db_project = db.query(ORMProject).filter(ORMProject.id == id).first()
    if not db_project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Construct scenario response payloads with attached active fuels
    scenarios_list = []
    for s in db_project.scenarios:
        attach_active_fuels(s, db_project.economy, db_project.sector_flow)
        scenarios_list.append({
            "id": s.id,
            "name": s.name,
            "target_year": s.target_year,
            "tree_state": s.tree_state,
            "macro_drivers": s.macro_drivers,
            "active_fuels": s.active_fuels
        })

    return {
        "id": db_project.id,
        "economy": db_project.economy,
        "sector_flow": db_project.sector_flow,
        "scenarios": scenarios_list
    }


@router.post("/projects/{id}/scenarios", response_model=schemas.Scenario, status_code=status.HTTP_201_CREATED)
def create_scenario(id: int, scenario: schemas.ScenarioCreate, db: Session = Depends(get_db)):
    """
    Creates a new scenario for a project. Dynamic APEC ingests retrieve 19 Total energy
    and populate leaves with strictly non-zero active fuels.
    """
    db_project = db.query(ORMProject).filter(ORMProject.id == id).first()
    if not db_project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    ty = scenario.target_year
    if not (1990 <= ty <= 2022):
        ty = 2022

    # Ingest target total, active leaf fuels, & GDP
    ingestor = APECDataIngestor()
    try:
        target_total = ingestor.get_total_energy(db_project.economy, str(ty), db_project.sector_flow)
        active_fuels = ingestor.get_active_fuels(db_project.economy, str(ty), db_project.sector_flow)
        gdp_val = ingestor.get_economy_gdp(db_project.economy)
    except Exception:
        target_total = 100.0
        active_fuels = []
        gdp_val = 1.0

    tree_state = scenario.tree_state
    if not tree_state:
        # Fetch the pre-built template
        tree_state = get_template_for_sector(db_project.sector_flow)
        
        # Only dynamically assign active fuels IF AND ONLY IF the returned template is completely empty
        if not tree_state:
            tree_state = build_dynamic_tree(db_project.sector_flow, db_project.economy, str(ty))
            
        if not tree_state:
            tree_state = {
                "node_id": db_project.sector_flow,
                "weight": 1.0,
                "min_weight": 0.0,
                "max_weight": 1.0,
                "imbalance_flag": False,
                "children": [],
                "fuels": [
                    {
                        "fuel_id": fuel["fuel_id"],
                        "share": round(1.0 / len(active_fuels), 4) if active_fuels else 1.0,
                        "min_weight": 0.0,
                        "max_weight": 1.0
                    } for fuel in active_fuels
                ]
            }

    db_scenario = ORMScenario(
        project_id=id,
        name=scenario.name or f"Projection {ty}",
        target_year=ty,
        tree_state=tree_state,
        macro_drivers={"target_total": target_total, "total": target_total, "gdp_ppp": gdp_val}
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    
    # Attach dynamic active_fuels for response payload serialization
    db_scenario.active_fuels = active_fuels
    return db_scenario


@router.put("/scenarios/{id}", response_model=schemas.Scenario)
def update_scenario(id: int, payload: schemas.ScenarioUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Saves the mutated tree_state and/or name of a scenario.
    """
    db_scenario = db.query(ORMScenario).filter(ORMScenario.id == id).first()
    if not db_scenario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    if db_scenario.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit this scenario")

    db_project = db_scenario.project

    if payload.name is not None:
        db_scenario.name = payload.name
    if payload.target_year is not None:
        ty = payload.target_year
        db_scenario.target_year = ty if (1990 <= ty <= 2022) else 2022
    if payload.tree_state is not None:
        db_scenario.tree_state = payload.tree_state
    if payload.macro_drivers is not None:
        db_scenario.macro_drivers = payload.macro_drivers

    db.commit()
    db.refresh(db_scenario)
    
    # Attach dynamic active fuels
    attach_active_fuels(db_scenario, db_project.economy, db_project.sector_flow)
    return db_scenario


@router.post("/scenarios/{id}/optimize", response_model=schemas.Scenario)
def optimize_scenario(id: int, payload: OptimizationRequest, db: Session = Depends(get_db)):
    """
    Performs SLSQP weight reconciliation on the scenario's tree_state using 
    the top-down macroeconomic target total, and saves the balanced state.
    """
    db_scenario = db.query(ORMScenario).filter(ORMScenario.id == id).first()
    if not db_scenario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found")

    db_project = db_scenario.project

    # Resolve target total
    target = payload.target_total
    if target is None:
        macro = db_scenario.macro_drivers or {}
        target = macro.get("target_total") or macro.get("total")

    if target is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A target_total is required either in the request body or inside macro_drivers."
        )

    tree = db_scenario.tree_state
    if not tree:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scenario tree_state is blank. Populate the branch canvas first."
        )

    try:
        attach_active_fuels(db_scenario, db_project.economy, db_project.sector_flow)
        optimized_tree = optimize_tree_state(tree, float(target), db_scenario.macro_drivers, db_scenario.active_fuels)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Mathematical SLSQP optimization error: {str(e)}"
        )

    db_scenario.tree_state = optimized_tree
    db.commit()
    db.refresh(db_scenario)
    
    # Attach active fuels
    attach_active_fuels(db_scenario, db_project.economy, db_project.sector_flow)
    return db_scenario


@router.post("/projects/{id}/export")
def export_project(
    id: int, 
    format: str = Query("json", description="Export format: 'json' or 'excel'"),
    db: Session = Depends(get_db)
):
    """
    Gathers all active scenario years for this project, traverses their models simultaneously, 
    and generates the dynamic LEAP Interp() expressions in JSON or Excel format.
    """
    db_project = db.query(ORMProject).filter(ORMProject.id == id).first()
    if not db_project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    scenarios = db_project.scenarios
    if not scenarios:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Project has no active scenarios to export."
        )

    # Collect year-based configurations
    scenario_map = {}
    for s in scenarios:
        if s.tree_state:
            scenario_map[s.target_year] = s.tree_state

    if not scenario_map:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No scenarios contain active tree state structures."
        )

    # Trigger Exporter
    exporter = LEAPExporter(scenario_map)
    df = exporter.export_to_dataframe()

    if format == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="LEAP Expressions")
        output.seek(0)
        
        filename = f"LEAP_Export_Project_{id}.xlsx"
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
        return StreamingResponse(
            output,
            headers=headers,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    # Default: return JSON format
    return df.to_dict(orient="records")


@router.delete("/projects/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(id: int, db: Session = Depends(get_db)):
    proj = db.query(ORMProject).filter(ORMProject.id == id).first()
    if not proj: raise HTTPException(status_code=404, detail="Not found")
    db.delete(proj)
    db.commit()
    return {"ok": True}

@router.delete("/scenarios/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_scenario(id: int, db: Session = Depends(get_db)):
    scen = db.query(ORMScenario).filter(ORMScenario.id == id).first()
    if not scen: raise HTTPException(status_code=404, detail="Not found")
    db.delete(scen)
    db.commit()
    return {"ok": True}


@router.post("/stateless/template", response_model=schemas.StatelessTemplateResponse)
def generate_stateless_template(request: schemas.StatelessTemplateRequest):
    tree_state = get_template_for_sector(request.sector_flow)
    
    ingestor = APECDataIngestor()
    try:
        target_total = ingestor.get_total_energy(request.economy, str(request.target_year), request.sector_flow)
        active_fuels = ingestor.get_active_fuels(request.economy, str(request.target_year), request.sector_flow)
        gdp_val = ingestor.get_economy_gdp(request.economy)
    except Exception:
        target_total = 100.0
        active_fuels = []
        gdp_val = 1.0

    if not tree_state:
        tree_state = build_dynamic_tree(request.sector_flow, request.economy, str(request.target_year))
        
    if not tree_state:
        tree_state = {
            "node_id": request.sector_flow,
            "weight": 1.0,
            "min_weight": 0.0,
            "max_weight": 1.0,
            "imbalance_flag": False,
            "children": [],
            "fuels": [
                {
                    "fuel_id": fuel["fuel_id"],
                    "share": round(1.0 / len(active_fuels), 4) if active_fuels else 1.0,
                    "min_weight": 0.0,
                    "max_weight": 1.0
                } for fuel in active_fuels
            ]
        }
        
    macro_drivers = {"target_total": target_total, "total": target_total, "gdp_ppp": gdp_val}
    return {"tree_state": tree_state, "macro_drivers": macro_drivers, "active_fuels": active_fuels}


@router.post("/stateless/optimize")
def stateless_optimize(request: schemas.StatelessOptimizeRequest):
    optimized_tree = optimize_tree_state(request.tree_state, request.target_total, request.macro_drivers, request.active_fuels)
    return {"tree_state": optimized_tree}

@router.post("/scenarios", response_model=schemas.Scenario, status_code=status.HTTP_201_CREATED)
def import_scenario(payload: schemas.ScenarioImport, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Imports a complete scenario JSON payload, auto-creating the parent Project if it doesn't exist,
    and returns the saved Scenario object.
    """
    # 1. Lookup or create Project
    db_project = db.query(ORMProject).filter(
        ORMProject.economy == payload.economy,
        ORMProject.sector_flow == payload.sector_flow
    ).first()
    
    if not db_project:
        db_project = ORMProject(
            economy=payload.economy,
            sector_flow=payload.sector_flow
        )
        db.add(db_project)
        db.commit()
        db.refresh(db_project)
        
    # 2. Create Scenario
    db_scenario = ORMScenario(
        project_id=db_project.id,
        name=payload.scenario_name,
        target_year=payload.target_year,
        tree_state=payload.tree_state,
        macro_drivers=payload.macro_drivers,
        owner_id=current_user.id
    )
    db.add(db_scenario)
    db.commit()
    db.refresh(db_scenario)
    
    # 3. Attach dynamic active_fuels for response serialization
    attach_active_fuels(db_scenario, db_project.economy, db_project.sector_flow)
    
    return db_scenario


