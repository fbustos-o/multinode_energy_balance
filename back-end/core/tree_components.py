from typing import List, Dict, Any, Optional

class FuelItem:
    """
    Represents an individual fuel assignment leaf within the bottom-up end-use structure.
    """
    def __init__(
        self, 
        fuel_id: str, 
        share: float, 
        min_weight: Optional[float] = None, 
        max_weight: Optional[float] = None
    ):
        self.fuel_id: str = fuel_id
        self.share: float = share
        self.min_weight: Optional[float] = min_weight
        self.max_weight: Optional[float] = max_weight

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fuel_id": self.fuel_id,
            "share": self.share,
            "min_weight": self.min_weight,
            "max_weight": self.max_weight
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "FuelItem":
        return cls(
            fuel_id=data["fuel_id"],
            share=data["share"],
            min_weight=data.get("min_weight"),
            max_weight=data.get("max_weight")
        )


class Node:
    """
    Represents a bottom-up branch node (e.g., sector, sub-sector, or end-use device/category).
    Supports hierarchical nesting and fuel assignments.
    """
    def __init__(
        self, 
        node_id: str, 
        weight: float, 
        min_weight: Optional[float] = None, 
        max_weight: Optional[float] = None,
        imbalance_flag: bool = False
    ):
        self.node_id: str = node_id
        self.weight: float = weight
        self.min_weight: Optional[float] = min_weight
        self.max_weight: Optional[float] = max_weight
        self.imbalance_flag: bool = imbalance_flag
        self.children: List[Node] = []
        self.fuels: List[FuelItem] = []

    def add_child(self, child: "Node") -> None:
        self.children.append(child)

    def add_fuel(self, fuel: FuelItem) -> None:
        self.fuels.append(fuel)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "weight": self.weight,
            "min_weight": self.min_weight,
            "max_weight": self.max_weight,
            "imbalance_flag": self.imbalance_flag,
            "children": [child.to_dict() for child in self.children],
            "fuels": [fuel.to_dict() for fuel in self.fuels]
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Node":
        node = cls(
            node_id=data["node_id"],
            weight=data["weight"],
            min_weight=data.get("min_weight"),
            max_weight=data.get("max_weight"),
            imbalance_flag=data.get("imbalance_flag", False)
        )
        for child_data in data.get("children", []):
            node.add_child(cls.from_dict(child_data))
        for fuel_data in data.get("fuels", []):
            node.add_fuel(FuelItem.from_dict(fuel_data))
        return node


# Pre-built templates for specific sectors.
# The template for "16.02 Residential" includes default branch weights representing shares.
# Strictly updated with standard APEC codes, standard end-uses, and deeply nested devices.
SECTOR_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "16.02 Residential": {
        "node_id": "16.02 Residential",
        "weight": 1.0,
        "min_weight": 0.0,
        "max_weight": 1.0,
        "imbalance_flag": False,
        "children": [
            {
                "node_id": "Space Heating", 
                "weight": 0.35, 
                "min_weight": 0.0, 
                "max_weight": 1.0, 
                "imbalance_flag": False,
                "children": [
                    {"node_id": "Central AC", "weight": 0.20, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Split/room AC", "weight": 0.20, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Natural Gas Heater", "weight": 0.30, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "08.01 Natural gas", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Kerosene Heater", "weight": 0.10, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "07.06 Kerosene", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "LPG Heater", "weight": 0.10, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "07.09 LPG", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Wood Heater", "weight": 0.10, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "15.05 Other biomass", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]}
                ], 
                "fuels": []
            },
            {
                "node_id": "Space Cooling", 
                "weight": 0.15, 
                "min_weight": 0.0, 
                "max_weight": 1.0, 
                "imbalance_flag": False,
                "children": [
                    {"node_id": "Central AC", "weight": 0.50, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Split/room AC", "weight": 0.50, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]}
                ], 
                "fuels": []
            },
            {
                "node_id": "Water Heating", 
                "weight": 0.20, 
                "min_weight": 0.0, 
                "max_weight": 1.0, 
                "imbalance_flag": False,
                "children": [
                    {"node_id": "Natural gas Boiler", "weight": 0.30, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "08.01 Natural gas", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "LPG heater", "weight": 0.20, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "07.09 LPG", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Wood heater", "weight": 0.20, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "15.05 Other biomass", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Electric Tank", "weight": 0.30, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]}
                ], 
                "fuels": []
            },
            {
                "node_id": "Cooking", 
                "weight": 0.15, 
                "min_weight": 0.0, 
                "max_weight": 1.0, 
                "imbalance_flag": False,
                "children": [
                    {"node_id": "Natural Gas Stove", "weight": 0.30, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "08.01 Natural gas", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "LPG Gas Stove", "weight": 0.30, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "07.09 LPG", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Electric Stove", "weight": 0.20, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "Wood/Biomass Stove", "weight": 0.20, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "15.05 Other biomass", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]}
                ], 
                "fuels": []
            },
            {
                "node_id": "Lighting", 
                "weight": 0.10, 
                "min_weight": 0.0, 
                "max_weight": 1.0, 
                "imbalance_flag": False,
                "children": [
                    {"node_id": "Traditional", "weight": 0.40, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]},
                    {"node_id": "LED", "weight": 0.60, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]}
                ], 
                "fuels": []
            },
            {
                "node_id": "Appliances", 
                "weight": 0.05, 
                "min_weight": 0.0, 
                "max_weight": 1.0, 
                "imbalance_flag": False,
                "children": [
                    {"node_id": "Electric appliances", "weight": 1.0, "min_weight": 0.0, "max_weight": 1.0, "imbalance_flag": False, "children": [], "fuels": [{"fuel_id": "17 Electricity", "share": 1.0, "min_weight": 0.0, "max_weight": 1.0}]}
                ], 
                "fuels": []
            }
        ],
        "fuels": []
    }
}


def get_template_for_sector(sector_name: str) -> Dict[str, Any]:
    """
    Resolves the sector name to its pre-built bottom-up tree template.
    If the sector has no template, an empty dictionary (blank canvas) is returned.
    """
    if sector_name in SECTOR_TEMPLATES:
        import copy
        return copy.deepcopy(SECTOR_TEMPLATES[sector_name])
    return {}

def build_dynamic_tree(sector_name: str, economy: str, year: str) -> Optional[Dict[str, Any]]:
    """
    Dynamically generates the tree_state for Industry and Transport 
    based on the APEC database base-year values.
    """
    if sector_name not in ["14 Industry sector", "15 Transport sector"]:
        return {}

    # Import locally to avoid circular dependencies if any
    from core.data_ingestion import APECDataIngestor
    ingestor = APECDataIngestor()
    
    try:
        df_flows, _ = ingestor.load_metadata()
        flow_list = df_flows["flows"].dropna().tolist()
    except Exception:
        return {}
        
    def get_flow_name(prefix: str) -> str:
        for f in flow_list:
            if f.startswith(prefix + " "):
                return f
        return prefix
        
    def build_node(flow_prefix: str, parent_total: float) -> Optional[tuple]:
        flow_name = get_flow_name(flow_prefix)
        energy = ingestor.get_total_energy(economy, year, flow_name)
        if energy <= 0:
            return None
        weight = energy / parent_total if parent_total > 0 else 0.0
        node = {
            "node_id": flow_name,
            "weight": round(weight, 4),
            "min_weight": 0.0,
            "max_weight": 1.0,
            "imbalance_flag": False,
            "children": [],
            "fuels": []
        }
        return node, energy

    if sector_name == "14 Industry sector":
        parent_energy = ingestor.get_total_energy(economy, year, sector_name)
        p_energy_used = parent_energy if parent_energy > 0 else 1.0
        
        children = []
        for sub in ["14.01", "14.02", "14.03"]:
            res = build_node(sub, p_energy_used)
            if not res:
                continue
            node, e = res
            
            if sub == "14.03":
                mfg_energy_used = e if e > 0 else 1.0
                mfg_children = []
                for i in range(1, 12):
                    subsub = f"14.03.{i:02d}"
                    child_res = build_node(subsub, mfg_energy_used)
                    if child_res:
                        mfg_children.append(child_res[0])
                node["children"] = mfg_children
                
            children.append(node)
            
        if not children:
            return {}

        return {
            "node_id": sector_name,
            "weight": 1.0,
            "min_weight": 0.0,
            "max_weight": 1.0,
            "imbalance_flag": False,
            "children": children,
            "fuels": []
        }

    if sector_name == "15 Transport sector":
        parent_energy = ingestor.get_total_energy(economy, year, sector_name)
        p_energy_used = parent_energy if parent_energy > 0 else 1.0
        children = []
        for i in range(1, 7):
            sub = f"15.{i:02d}"
            res = build_node(sub, p_energy_used)
            if res:
                children.append(res[0])
                
        if not children:
            return {}

        return {
            "node_id": sector_name,
            "weight": 1.0,
            "min_weight": 0.0,
            "max_weight": 1.0,
            "imbalance_flag": False,
            "children": children,
            "fuels": []
        }

    return {}
