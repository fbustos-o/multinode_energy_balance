import json
import os
import sys

# Add backend directory to sys.path
backend_dir = r"c:\Users\fabian.bustos\OneDrive - APERC\APERC-FBO\1 - Programs\6 - Outlook\v10\back-end"
sys.path.append(backend_dir)

from core.optimization_engine import optimize_tree_state

def test_regression():
    file_path = r"C:\Users\fabian.bustos\Downloads\20USA_2022_16_02_Residential (1).json"
    
    if not os.path.exists(file_path):
        print(f"Error: Could not find test fixture {file_path}")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Unwrap state
    if "tree_state" in data:
        if "base_year" in data["tree_state"]:
            tree_state = data["tree_state"]["base_year"]
        else:
            tree_state = data["tree_state"]
    else:
        tree_state = data

    target_total = 11554.33
    macro_drivers = data.get("macro_drivers", {})
    
    active_fuels = data.get("active_fuels", [])
    if isinstance(active_fuels, dict):
        if "base_year" in active_fuels:
            active_fuels = active_fuels["base_year"]
        else:
            active_fuels = active_fuels.get(base_year, [])

    print("Running initial optimization...")
    res = optimize_tree_state(
        tree_state=tree_state,
        target_total=target_total,
        macro_drivers=macro_drivers,
        active_fuels=active_fuels
    )

    print(f"Success: {res.get('optimization_success')}")
    print(f"Message: {res.get('optimization_message')}")
    
    if "fuel_residuals" in res:
        print(f"Fuel residuals calculated: {len(res['fuel_residuals'])}")
        for r in res['fuel_residuals']:
            print(f"  {r['fuel_id']}: Calc {r['calc']} PJ vs Target {r['target']} PJ (Diff {r['abs_pj']} PJ, {r['rel_pct']}%)")
    if "bound_pinned_fuels" in res:
        print(f"Bound pinned fuels: {res['bound_pinned_fuels']}")
    
    # Calculate energy output
    def count_pj(node):
        total = 0
        fuels = node.get("fuels", [])
        if not node.get("children") and fuels:
            for f in fuels:
                total += f.get("calculated_pj", 0)
        for c in node.get("children", []):
            total += count_pj(c)
        return total
        
    calc_total = count_pj(res)
    print(f"Calculated Total Energy: {calc_total:.4f} PJ (Target: {target_total} PJ)")

if __name__ == "__main__":
    test_regression()
