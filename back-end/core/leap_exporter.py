import pandas as pd
from typing import Dict, Any, List, Tuple, Optional

class LEAPExporter:
    """
    Generates standard LEAP (Long-range Energy Alternatives Planning system) 
    expressions for dynamic model integration. It simultaneously traverses different 
    multi-year scenario tree configurations to build 'Interp' functions.
    """
    def __init__(self, scenarios: Dict[int, Dict[str, Any]]):
        """
        Initialize with a mapping of target year (int) -> tree_state dictionary.
        Example:
            {
                2024: tree_base,
                2035: tree_35,
                2050: tree_50
            }
        """
        self.scenarios: Dict[int, Dict[str, Any]] = scenarios
        self.years: List[int] = sorted(scenarios.keys())

    def _collect_tree_values(
        self, 
        node: Dict[str, Any], 
        parent_path: Tuple[str, ...] = ()
    ) -> Dict[Tuple[str, ...], Dict[str, Any]]:
        """
        Recursively walks down the tree structure to capture all nodes and fuel shares.
        Maps each unique branch path to its configuration type and weight value.
        """
        results: Dict[Tuple[str, ...], Dict[str, Any]] = {}
        node_id = node.get("node_id", "Root")
        current_path = parent_path + (node_id,)

        # Save current node weight details
        results[current_path] = {
            "type": "Node",
            "value": float(node.get("weight", 1.0))
        }

        # Traverse nested child branches
        for child in node.get("children", []):
            results.update(self._collect_tree_values(child, current_path))

        # Traverse fuel assignments
        for fuel in node.get("fuels", []):
            fuel_id = fuel.get("fuel_id", "")
            if fuel_id:
                fuel_path = current_path + (fuel_id,)
                results[fuel_path] = {
                    "type": "Fuel",
                    "value": float(fuel.get("share", 0.0))
                }

        return results

    def export_to_dataframe(self) -> pd.DataFrame:
        """
        Compiles the multi-year scenario states into a single unified grid, 
        calculating the 'LEAP Expression' using the standard Interp formula.
        If a node is missing in any target year, its value defaults to 0.
        """
        if not self.years:
            return pd.DataFrame(columns=["Path", "Type", "LEAP Expression"])

        # Gather paths and weights for each individual year
        year_data: Dict[int, Dict[Tuple[str, ...], Dict[str, Any]]] = {}
        all_paths: set[Tuple[str, ...]] = set()
        path_types: Dict[Tuple[str, ...], str] = {}

        for year in self.years:
            tree = self.scenarios[year]
            collected = self._collect_tree_values(tree)
            year_data[year] = collected
            for path, info in collected.items():
                all_paths.add(path)
                path_types[path] = info["type"]

        # Sort the path tuples to maintain visual and structured hierarchy in Excel
        sorted_paths = sorted(list(all_paths))

        rows: List[Dict[str, Any]] = []
        for path in sorted_paths:
            path_str = " > ".join(path)
            row: Dict[str, Any] = {
                "Path": path_str,
                "Type": path_types[path]
            }

            # Map hierarchical levels (supports up to 5 levels of branching depth)
            for level in range(5):
                row[f"Level_{level + 1}"] = path[level] if level < len(path) else ""

            # Evaluate each year and construct Interpolation parameters
            interp_params: List[str] = []
            for year in self.years:
                val = 0.0
                if path in year_data[year]:
                    val = year_data[year][path]["value"]
                
                row[f"Year_{year}"] = val
                
                # Format to represent integers where clean, and round floats to avoid precision clutter
                formatted_val = f"{val:g}"
                interp_params.append(f"{year}, {formatted_val}")

            # Assemble LEAP dynamic syntax: Interp(2024, 0.35, 2035, 0.50, 2050, 0.65)
            row["LEAP Expression"] = f"Interp({', '.join(interp_params)})"
            rows.append(row)

        return pd.DataFrame(rows)

    def export_to_excel(self, filepath: str) -> None:
        """
        Helper method to output the calculated expressions directly into a .xlsx spreadsheet.
        """
        df = self.export_to_dataframe()
        df.to_excel(filepath, index=False)
