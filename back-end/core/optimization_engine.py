import numpy as np
from scipy.optimize import minimize
from typing import List, Dict, Any, Optional, Tuple
import copy

def reconcile_weights(
    initial_weights: List[float],
    base_values: List[float],
    target_total: float,
    min_weights: List[Optional[float]],
    max_weights: List[Optional[float]]
) -> Dict[str, Any]:
    """
    Core SLSQP optimization solver. Adjusts initial branch weights to satisfy
    a top-down macroeconomic target sum, while honoring bounding constraints
    and minimizing deviation from the user's initial bottom-up choices.
    """
    w0 = np.array(initial_weights, dtype=float)
    x = np.array(base_values, dtype=float)
    n = len(w0)

    if n == 0:
        return {
            "success": False,
            "optimized_weights": [],
            "final_total": 0.0,
            "imbalance": 0.0,
            "imbalance_flag": False,
            "message": "Empty weight vector provided."
        }

    # Objective: Minimize squared sum of relative deviations from original weights
    def objective(w):
        devs = []
        for i in range(n):
            init = w0[i]
            if abs(init) > 1e-9:
                devs.append(((w[i] - init) / init) ** 2)
            else:
                devs.append((w[i] - init) ** 2)
        return sum(devs)

    # Constraint: sum(w[i] * x[i]) = target_total
    def constraint_eq(w):
        return np.dot(w, x) - target_total

    constraints = [{"type": "eq", "fun": constraint_eq}]

    # Bounding constraints
    bounds = []
    for mn, mx in zip(min_weights, max_weights):
        b_min = 0.0
        if mn is not None and str(mn).strip() != "":
            try:
                b_min = float(mn)
            except ValueError:
                b_min = 0.0
                
        b_max = None
        if mx is not None and str(mx).strip() != "":
            try:
                b_max = float(mx)
            except ValueError:
                b_max = None
        bounds.append((b_min, b_max))

    # Run SLSQP optimization
    res = minimize(
        objective,
        x0=w0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={'maxiter': 2000, 'ftol': 1e-6, 'disp': False}
    )

    optimized = res.x.tolist() if res.success else w0.tolist()
    success = bool(res.success)
    
    # Calculate results
    final_total = float(np.dot(optimized, x))
    imbalance = abs(final_total - target_total)
    
    # Flag imbalance if deviation exceeds 0.5% of target
    imbalance_flag = imbalance > (0.005 * target_total)

    return {
        "success": success,
        "optimized_weights": optimized,
        "final_total": final_total,
        "imbalance": imbalance,
        "imbalance_flag": imbalance_flag,
        "message": res.message
    }


def extract_variables(node: Dict[str, Any], path: List[Any] = []) -> Tuple[List[float], List[Tuple[float, float]], List[Dict[str, Any]]]:
    """
    Recursively extracts mutable variables (weights and fuel shares) from the tree state.
    Respects the mutually exclusive rule: only extracts fuels if the node has no children.
    """
    x0 = []
    bounds = []
    refs = []

    is_root = (len(path) == 0)

    if not is_root:
        # Node weight is a mutable variable
        weight = float(node.get("weight", 1.0))
        min_w = node.get("min_weight")
        max_w = node.get("max_weight")

        # Robust bounds parsing to avoid ValueError and properly default values
        b_min = 0.0
        if min_w is not None and str(min_w).strip() != "":
            try:
                b_min = float(min_w)
            except ValueError:
                b_min = 0.0
        
        b_max = 1.0
        if max_w is not None and str(max_w).strip() != "":
            try:
                b_max = float(max_w)
            except ValueError:
                b_max = 1.0

        x0.append(weight)
        bounds.append((b_min, b_max))
        refs.append({
            "type": "weight",
            "path": list(path)
        })

    children = node.get("children", [])
    has_children = len(children) > 0

    if has_children:
        # Recurse children
        for idx, child in enumerate(children):
            child_x0, child_bounds, child_refs = extract_variables(child, path + ["children", idx])
            x0.extend(child_x0)
            bounds.extend(child_bounds)
            refs.extend(child_refs)
        # Mutually exclusive: if node has children, any fuels it holds should be ignored/deleted
        if "fuels" in node:
            node["fuels"] = []
    else:
        # Leaf node: extract fuel shares
        fuels = node.get("fuels", [])
        for idx, fuel in enumerate(fuels):
            share = float(fuel.get("share", 0.0))
            min_s = fuel.get("min_weight")
            max_s = fuel.get("max_weight")

            b_min = 0.0
            if min_s is not None and str(min_s).strip() != "":
                try:
                    b_min = float(min_s)
                except ValueError:
                    b_min = 0.0

            b_max = 1.0
            if max_s is not None and str(max_s).strip() != "":
                try:
                    b_max = float(max_s)
                except ValueError:
                    b_max = 1.0

            x0.append(share)
            bounds.append((b_min, b_max))
            refs.append({
                "type": "share",
                "path": path + ["fuels", idx]
            })

    return x0, bounds, refs


def apply_variables(tree: Dict[str, Any], x: np.ndarray, refs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Applies optimized variable values back into the tree state in-place.
    """
    for val, ref in zip(x, refs):
        ref_type = ref["type"]
        path = ref["path"]
        
        curr = tree
        for key in path:
            curr = curr[key]
            
        if ref_type == "weight":
            curr["weight"] = float(val)
        elif ref_type == "share":
            curr["share"] = float(val)
            
    return tree


def calculate_tree_energy(node: Dict[str, Any], macro_drivers: Dict[str, Any], multiplier: float = 1.0, is_root: bool = True) -> float:
    """
    Recursively calculates the bottom-up effective energy contribution of the tree.
    """
    link = node.get("macro_driver_link")
    current_multiplier = multiplier
    
    if not is_root:
        if link and macro_drivers and link in macro_drivers:
            val = float(macro_drivers[link])
            divisor = 1000.0 if (link in ["households", "floor_area"] or val > 10.0) else (2.5 if link == "occupancy" else 1.0)
            current_multiplier = multiplier * (val / divisor)
        else:
            current_multiplier = multiplier * float(node.get("weight", 0.0))
    else:
        current_multiplier = multiplier * float(node.get("weight", 1.0))
        
    fuels = node.get("fuels", [])
    total_energy = 0.0
    
    children = node.get("children", [])
    has_children = len(children) > 0
    
    if not has_children and fuels:
        for fuel in fuels:
            # Pure Petajoules: Just multiply by share, NEVER multiply by 100.0
            total_energy += current_multiplier * float(fuel.get("share", 0.0))
            
    if has_children:
        for child in children:
            total_energy += calculate_tree_energy(child, macro_drivers, current_multiplier, is_root=False)
            
    return total_energy


def attach_calculated_energy(
    node_dict: dict, 
    current_energy: float, 
    macro_drivers: dict = None, 
    is_root: bool = True
) -> None:
    """
    Recursively calculates the flowing energy of each node and fuel,
    assigning 'calculated_pj' key in-place to enrich the output payload.
    """
    active_macro = macro_drivers or {}
    
    link = node_dict.get("macro_driver_link")
    node_energy = current_energy
    
    if not is_root:
        if link and link in active_macro:
            val = float(active_macro[link])
            divisor = 1000.0 if (link in ["households", "floor_area"] or val > 10.0) else (2.5 if link == "occupancy" else 1.0)
            node_energy = current_energy * (val / divisor)
        else:
            node_energy = current_energy * float(node_dict.get("weight", 0.0))
    else:
        node_energy = current_energy * float(node_dict.get("weight", 1.0))
        
    node_dict["calculated_pj"] = float(round(node_energy, 4))
    
    # Assign to fuels
    if "fuels" in node_dict and node_dict["fuels"]:
        for fuel in node_dict["fuels"]:
            fuel_energy = node_energy * float(fuel.get("share", 0.0))
            fuel["calculated_pj"] = float(round(fuel_energy, 4))
            
    children = node_dict.get("children", [])
    if children:
        for child in children:
            attach_calculated_energy(child, node_energy, active_macro, is_root=False)


def optimize_tree_state(
    tree_state: Dict[str, Any], 
    target_total: float,
    macro_drivers: Optional[Dict[str, Any]] = None,
    active_fuels: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Recursively optimizes tree weights and fuel shares to match a top-down macroeconomic target sum,
    while honoring bounding constraints, mutually exclusive leaf-node fuels, and scaling macro drivers.
    """
    tree = copy.deepcopy(tree_state)
    active_macro = macro_drivers or {}

    # Extract all mutable variables across the entire tree hierarchy
    x0, bounds, refs = extract_variables(tree, [])

    if len(x0) == 0:
        tree["optimization_success"] = False
        tree["optimization_message"] = "No mutable variables found in the tree state."
        return tree

    w0 = np.array(x0, dtype=float)
    
    # Parse fuel targets
    fuel_targets = {}
    if active_fuels:
        for f in active_fuels:
            if isinstance(f, dict):
                fuel_targets[f["fuel_id"]] = float(f.get("value") or 0.0)
            else:
                fuel_targets[getattr(f, "fuel_id", "")] = float(getattr(f, "value", 0.0) or 0.0)
        #print(f"Parsed fuel targets: {fuel_targets}")

    # 1. Normalized SSE Objective Function exactly like v9
    def objective(x):
        if not fuel_targets:
            return 0.0
            
        # 1. Apply current solver weights (x) to a temporary tree
        temp_tree = apply_variables(tree, x, refs)
        contributions = {}
        
        # 2. Calculate bottom-up energy strictly using fractions (No hardcoded * 100 multipliers!)
        def traverse(node, current_energy):
            link = node.get("macro_driver_link")
            
            # Calculate node's incoming energy
            if node is not temp_tree:
                if link and active_macro and link in active_macro:
                    val = float(active_macro[link])
                    divisor = 1000.0 if (link in ["households", "floor_area"] or val > 10.0) else (2.5 if link == "occupancy" else 1.0)
                    node_energy = current_energy * (val / divisor)
                else:
                    node_energy = current_energy * float(node.get("weight", 0.0))
            else:
                node_energy = current_energy * float(node.get("weight", 1.0))
                
            # Aggregate fuel energies
            fuels = node.get("fuels", [])
            children = node.get("children", [])
            
            if not children and fuels:
                for fuel in fuels:
                    fid = fuel["fuel_id"]
                    # CRITICAL: Just multiply by share, NEVER multiply by 100.0
                    fuel_energy = node_energy * float(fuel.get("share", 0.0))
                    contributions[fid] = contributions.get(fid, 0.0) + fuel_energy
                    
            if children:
                for child in children:
                    traverse(child, node_energy)
                    
        # Start traversal with the target_total as the root's incoming energy
        traverse(temp_tree, target_total)
        
        # 3. Calculate SSE for individual fuel targets
        error = 0.0
        for fid, target in fuel_targets.items():
            calc = contributions.get(fid, 0.0)
            error += (calc - target)**2
            
        # Add small regularizer to maintain matrix stability
        for i in range(len(w0)):
            error += 1e-6 * ((x[i] - w0[i]) ** 2)
            
        safe_target = max(target_total, 1.0)
        #print(f"Current SSE: {error:.6f} for fuel targets: {fuel_targets} with contributions: {contributions}")
        return error / (safe_target ** 2)  # Scale relative to squared target

    # 3. Sibling Sum Constraints only (weights sum to exactly 1.0)
    sibling_groups = {}
    for idx, ref in enumerate(refs):
        parent_path = tuple(ref["path"][:-1])
        if parent_path not in sibling_groups:
            sibling_groups[parent_path] = []
        sibling_groups[parent_path].append(idx)
        
    def make_sum_constraint(indices):
        return lambda x: sum(x[idx] for idx in indices) - 1.0

    constraints = []
    for parent_path, indices in sibling_groups.items():
        constraints.append({
            "type": "eq",
            "fun": make_sum_constraint(indices)
        })

    # Total Energy Inequality Constraints (within 5% of target_total)
    margin = 0.05 * target_total

    def total_energy_upper(x):
        temp_tree = apply_variables(tree, x, refs)
        current_total = calculate_tree_energy(temp_tree, active_macro, target_total, is_root=True)
        return target_total + margin - current_total

    def total_energy_lower(x):
        temp_tree = apply_variables(tree, x, refs)
        current_total = calculate_tree_energy(temp_tree, active_macro, target_total, is_root=True)
        return current_total - (target_total - margin)

    constraints.append({
        "type": "ineq",
        "fun": total_energy_upper
    })
    constraints.append({
        "type": "ineq",
        "fun": total_energy_lower
    })

    # 2. SLSQP Solver options: scaled objective requires tighter ftol, smaller eps for accurate gradients
    res = minimize(
        objective,
        x0=w0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={'maxiter': 5000, 'ftol': 1e-7, 'eps': 1e-5, 'disp': False}
    )

    # Map optimized variables back and mark boundary constraint infractions (imbalances)
    optimized_x = res.x.tolist() if res.success else w0.tolist()

    for val, ref in zip(optimized_x, refs):
        ref_type = ref["type"]
        path = ref["path"]
        
        curr = tree
        for key in path:
            curr = curr[key]
            
        if ref_type == "weight":
            curr["weight"] = float(val)
            
            # Check bounds for node weight
            min_w = curr.get("min_weight")
            max_w = curr.get("max_weight")
            node_imbalance = False
            
            # Robust parsing of min_w / max_w for boundary check
            b_min = 0.0
            if min_w is not None and str(min_w).strip() != "":
                try:
                    b_min = float(min_w)
                except ValueError:
                    b_min = 0.0
            
            b_max = 1.0
            if max_w is not None and str(max_w).strip() != "":
                try:
                    b_max = float(max_w)
                except ValueError:
                    b_max = 1.0
                    
            if val < (b_min - 1e-4) or val > (b_max + 1e-4):
                node_imbalance = True
            curr["imbalance_flag"] = node_imbalance
            
        elif ref_type == "share":
            curr["share"] = float(val)
            
            # Check bounds for fuel share
            min_s = curr.get("min_weight")
            max_s = curr.get("max_weight")
            fuel_imbalance = False
            
            # Robust parsing of min_s / max_s for boundary check
            b_min = 0.0
            if min_s is not None and str(min_s).strip() != "":
                try:
                    b_min = float(min_s)
                except ValueError:
                    b_min = 0.0
            
            b_max = 1.0
            if max_s is not None and str(max_s).strip() != "":
                try:
                    b_max = float(max_s)
                except ValueError:
                    b_max = 1.0
                    
            if val < (b_min - 1e-4) or val > (b_max + 1e-4):
                fuel_imbalance = True
            curr["imbalance_flag"] = fuel_imbalance

    # Recalculate net final bottom-up energy to compare targets
    final_total = calculate_tree_energy(tree, active_macro, target_total, is_root=True)
    imbalance = abs(final_total - target_total)
    imbalance_flag = imbalance > (0.005 * target_total)

    # Set overall status on root tree node
    tree["imbalance_flag"] = imbalance_flag
    tree["optimization_success"] = bool(res.success)
    tree["optimization_message"] = res.message

    # Attach intermediate calculated energy (PJ) values recursively
    attach_calculated_energy(tree, target_total, active_macro, is_root=True)

    return tree
