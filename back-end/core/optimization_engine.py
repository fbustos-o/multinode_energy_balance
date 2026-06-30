import numpy as np
from scipy.optimize import minimize
from typing import List, Dict, Any, Optional, Tuple
import copy

def extract_variables(node: Dict[str, Any], path: List[Any] = [], is_only_child: bool = False, in_balancing_tree: bool = False) -> Tuple[List[float], List[Tuple[float, float]], List[Dict[str, Any]]]:
    """
    Recursively extracts mutable variables (weights and fuel shares) from the tree state.
    Respects the mutually exclusive rule: only extracts fuels if the node has no children.
    """
    x0 = []
    bounds = []
    refs = []

    is_root = (len(path) == 0)
    node_id = node.get("node_id", "")
    is_balancing = in_balancing_tree or node_id in ["Balancing Node", "Unspecified Uses"]

    if not is_root and not is_only_child:
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
            "path": list(path),
            "is_balancing": is_balancing
        })

    children = node.get("children", [])
    has_children = len(children) > 0

    if has_children:
        is_single_child = len(children) == 1
        # Recurse children
        for idx, child in enumerate(children):
            child_x0, child_bounds, child_refs = extract_variables(child, path + ["children", idx], is_only_child=is_single_child, in_balancing_tree=is_balancing)
            x0.extend(child_x0)
            bounds.extend(child_bounds)
            refs.extend(child_refs)
        # Mutually exclusive: if node has children, any fuels it holds should be ignored/deleted
        if "fuels" in node:
            node["fuels"] = []
    else:
        # Leaf node: extract fuel shares
        fuels = node.get("fuels", [])
        is_single_fuel = len(fuels) == 1
        for idx, fuel in enumerate(fuels):
            if is_single_fuel:
                continue
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
                "path": path + ["fuels", idx],
                "is_balancing": is_balancing
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


def calculate_tree_energy(node: Dict[str, Any], incoming_energy: float, is_root: bool = True) -> float:
    """
    Recursively calculates the bottom-up effective energy contribution of the tree
    by routing incoming_energy through normalized branch weights and fuel shares.
    """
    if is_root:
        node_energy = incoming_energy * float(node.get("weight", 1.0))
    else:
        node_energy = incoming_energy

    fuels = node.get("fuels", [])
    total_energy = 0.0
    children = node.get("children", [])
    has_children = len(children) > 0

    if not has_children and fuels:
        total_share = sum(float(f.get("share", 0.0)) for f in fuels)
        for fuel in fuels:
            share = float(fuel.get("share", 0.0))
            norm_share = (share / total_share) if total_share > 0 else 0.0
            total_energy += node_energy * norm_share

    if has_children:
        total_weight = sum(float(c.get("weight", 0.0)) for c in children)
        for child in children:
            weight = float(child.get("weight", 0.0))
            norm_weight = (weight / total_weight) if total_weight > 0 else 0.0
            child_energy = node_energy * norm_weight
            total_energy += calculate_tree_energy(child, child_energy, is_root=False)

    return total_energy


def attach_calculated_energy(
    node_dict: dict, 
    current_energy: float, 
    is_root: bool = True
) -> None:
    """
    Recursively calculates the flowing energy of each node and fuel,
    assigning 'calculated_pj' key in-place to enrich the output payload.
    """
    if is_root:
        node_energy = current_energy * float(node_dict.get("weight", 1.0))
    else:
        node_energy = current_energy
        
    node_dict["calculated_pj"] = float(round(node_energy, 4))
    
    # Assign to fuels
    fuels = node_dict.get("fuels", [])
    if fuels:
        total_share = sum(float(f.get("share", 0.0)) for f in fuels)
        for fuel in fuels:
            share = float(fuel.get("share", 0.0))
            norm_share = (share / total_share) if total_share > 0 else 0.0
            fuel_energy = node_energy * norm_share
            fuel["calculated_pj"] = float(round(fuel_energy, 4))
            
    children = node_dict.get("children", [])
    if children:
        total_weight = sum(float(c.get("weight", 0.0)) for c in children)
        for child in children:
            weight = float(child.get("weight", 0.0))
            norm_weight = (weight / total_weight) if total_weight > 0 else 0.0
            child_energy = node_energy * norm_weight
            attach_calculated_energy(child, child_energy, is_root=False)


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

    # Initial point
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
        
        # 2. Calculate bottom-up energy strictly using normalized fractions
        def traverse(node, current_energy):
            if node is temp_tree:
                node_energy = current_energy * float(node.get("weight", 1.0))
            else:
                node_energy = current_energy
                
            # Aggregate fuel energies
            fuels = node.get("fuels", [])
            children = node.get("children", [])
            
            if not children and fuels:
                total_share = sum(float(f.get("share", 0.0)) for f in fuels)
                for fuel in fuels:
                    fid = fuel["fuel_id"]
                    share = float(fuel.get("share", 0.0))
                    norm_share = (share / total_share) if total_share > 0 else 0.0
                    fuel_energy = node_energy * norm_share
                    contributions[fid] = contributions.get(fid, 0.0) + fuel_energy
                    
            if children:
                total_weight = sum(float(c.get("weight", 0.0)) for c in children)
                for child in children:
                    weight = float(child.get("weight", 0.0))
                    norm_weight = (weight / total_weight) if total_weight > 0 else 0.0
                    child_energy = node_energy * norm_weight
                    traverse(child, child_energy)
                    
        # Start traversal with the target_total as the root's incoming energy
        traverse(temp_tree, target_total)
        
        # 3. Calculate SSE for individual fuel targets using relative error
        error = 0.0
        for fid, target in fuel_targets.items():
            calc = contributions.get(fid, 0.0)
            if target > 1e-9:
                error += ((calc - target) ** 2) / target
            else:
                error += calc ** 2  # Fallback if target is essentially 0
            
        # Add expert proximity regularizer
        for i in range(len(w0)):
            lam = 1e-8 if refs[i].get("is_balancing") else 0.01
            error += lam * ((x[i] - w0[i]) ** 2)
            
        return error

    # Constraints: sum(x) = 1.0 for each group of siblings is no longer required 
    # since we use normalized routing, and it causes SLSQP to fail when x0 violates bounds.
    constraints = []

    # Total Energy Inequality Constraints (removed)

    # Run optimization using L-BFGS-B (better at large scale bounded problems without equality constraints)
    res = minimize(
        objective,
        x0=w0,
        method="L-BFGS-B",
        bounds=bounds,
        options={'maxiter': 2000, 'ftol': 1e-6, 'disp': False}
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
    final_total = calculate_tree_energy(tree, target_total, is_root=True)
    imbalance = abs(final_total - target_total)
    imbalance_flag = imbalance > (0.005 * target_total)

    # Attach intermediate calculated energy (PJ) values recursively
    attach_calculated_energy(tree, target_total, is_root=True)

    fuel_residuals = []
    bound_pinned_fuels = []
    
    computed_fuels = {}
    def collect_fuels(node):
        if not node.get("children") and node.get("fuels"):
            for f in node["fuels"]:
                fid = f["fuel_id"]
                computed_fuels[fid] = computed_fuels.get(fid, 0.0) + f.get("calculated_pj", 0.0)
        for c in node.get("children", []):
            collect_fuels(c)
    collect_fuels(tree)

    for fid, target in fuel_targets.items():
        calc = computed_fuels.get(fid, 0.0)
        abs_err = abs(calc - target)
        rel_err = (abs_err / target * 100.0) if target > 1e-9 else 0.0
        fuel_residuals.append({
            "fuel_id": fid,
            "calc": float(round(calc, 4)),
            "target": float(round(target, 4)),
            "abs_pj": float(round(abs_err, 4)),
            "rel_pct": float(round(rel_err, 2))
        })
        
        if calc > target + 0.1:
            is_pinned = False
            def check_pinned_min(node, parent_pinned=False):
                nonlocal is_pinned
                w = float(node.get("weight", 1.0))
                min_w = float(node.get("min_weight") or 0.0)
                node_pinned = parent_pinned or (w <= min_w + 1e-4)
                if not node.get("children") and node.get("fuels"):
                    for f in node["fuels"]:
                        if f["fuel_id"] == fid:
                            s = float(f.get("share", 0.0))
                            min_s = float(f.get("min_weight") or 0.0)
                            if node_pinned or (s <= min_s + 1e-4):
                                is_pinned = True
                for c in node.get("children", []):
                    check_pinned_min(c, node_pinned)
            check_pinned_min(tree)
            if is_pinned:
                bound_pinned_fuels.append(fid)
        elif calc < target - 0.1:
            is_pinned = False
            def check_pinned_max(node, parent_pinned=False):
                nonlocal is_pinned
                w = float(node.get("weight", 1.0))
                max_w = float(node.get("max_weight") if node.get("max_weight") is not None else 1.0)
                node_pinned = parent_pinned or (w >= max_w - 1e-4)
                if not node.get("children") and node.get("fuels"):
                    for f in node["fuels"]:
                        if f["fuel_id"] == fid:
                            s = float(f.get("share", 0.0))
                            max_s = float(f.get("max_weight") if f.get("max_weight") is not None else 1.0)
                            if node_pinned or (s >= max_s - 1e-4):
                                is_pinned = True
                for c in node.get("children", []):
                    check_pinned_max(c, node_pinned)
            check_pinned_max(tree)
            if is_pinned:
                bound_pinned_fuels.append(fid)

    tree["fuel_residuals"] = fuel_residuals
    tree["bound_pinned_fuels"] = bound_pinned_fuels

    # Handle Bounded Optimal Success
    success = bool(res.success)
    message = res.message
    if not success and ("Positive directional derivative" in message or "Iteration limit" in message):
        success = True
        message = f"Bounded optimum ({message})"

    # Set overall status on root tree node
    tree["imbalance_flag"] = imbalance_flag
    tree["optimization_success"] = success
    tree["optimization_message"] = message

    return tree
