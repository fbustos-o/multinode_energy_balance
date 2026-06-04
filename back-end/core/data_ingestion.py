import os
from typing import List, Dict, Any, Tuple, Optional
import pandas as pd

class APECDataIngestor:
    """
    Handles reading and processing of bottom-up/top-down macroeconomic and energy flow data
    originating from the APEC CSV database files.
    """
    def __init__(self, data_dir: Optional[str] = None):
        if data_dir is None:
            # Default to the sibling 'data' directory relative to this file's folder
            data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        self.data_dir: str = os.path.abspath(data_dir)
        self.macro_file: str = os.path.join(self.data_dir, "00APEC_2024_low.csv")
        self.flows_file: str = os.path.join(self.data_dir, "esto_flows_codes_to_names.csv")
        self.products_file: str = os.path.join(self.data_dir, "esto_products_codes_to_names.csv")

    def load_macro_data(self) -> pd.DataFrame:
        """
        Loads the main macro-energy historical and projection dataset.
        """
        if not os.path.exists(self.macro_file):
            raise FileNotFoundError(f"APEC macro data file not found at {self.macro_file}")
        return pd.read_csv(self.macro_file)

    def load_metadata(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Loads flow and product classification/hierarchical structure metadata.
        """
        if not os.path.exists(self.flows_file):
            raise FileNotFoundError(f"Flows metadata file not found at {self.flows_file}")
        if not os.path.exists(self.products_file):
            raise FileNotFoundError(f"Products metadata file not found at {self.products_file}")
        
        df_flows = pd.read_csv(self.flows_file)
        df_products = pd.read_csv(self.products_file)
        return df_flows, df_products

    def get_economies(self) -> List[str]:
        """
        Returns a sorted list of unique economy codes present in the APEC database.
        """
        df = self.load_macro_data()
        return sorted(df["economy"].dropna().unique().tolist())

    def get_flows(self) -> List[str]:
        """
        Returns a sorted list of unique flows (sectors) present in the APEC database.
        """
        df = self.load_macro_data()
        return sorted(df["flows"].dropna().unique().tolist())

    def get_total_energy(self, economy: str, year: str, flow: str) -> float:
        """
        Queries the loaded dataset to fetch the top-down macroeconomic sector total
        energy consumption (where product equals '19 Total') for the given economy, year, and flow.
        """
        df_macro = self.load_macro_data()
        year_str = str(year)
        if year_str not in df_macro.columns:
            raise ValueError(f"Year '{year_str}' is not present in the APEC dataset columns.")

        filtered = df_macro[
            (df_macro["economy"] == economy) & 
            (df_macro["flows"] == flow) & 
            (df_macro["products"] == "19 Total")
        ]

        if filtered.empty:
            # Fallback value if no match is found
            return 100.0

        return float(filtered[year_str].iloc[0])

    def get_active_fuels(self, economy: str, year: str, flow: str) -> List[Dict[str, Any]]:
        """
        Retrieves active base fuels (leaf products) for a given economy, year, and flow.
        A product is active if:
          1. It is defined in the products metadata CSV.
          2. It is a subtotal or not, following these rules:
             - If is_subtotal == False: It is a candidate.
             - If is_subtotal == True: It is ONLY a candidate if it has NO children in the hierarchy.
          3. Its numeric code prefix is strictly less than 19 (exclude >= 19).
          4. It exists in the database with a non-zero value for the given economy, year, and flow.
        """
        df_macro = self.load_macro_data()
        df_flows, df_products = self.load_metadata()

        # Ensure active columns include the requested year
        year_str = str(year)
        if year_str not in df_macro.columns:
            raise ValueError(f"Year '{year_str}' is not present in the APEC dataset columns.")

        # Helper to extract the code part (e.g. "01.01" from "01.01 Coking coal")
        def extract_code(name: str) -> str:
            return name.split(" ", 1)[0] if isinstance(name, str) else ""

        # Map each code to its full name
        product_list = df_products["products"].dropna().tolist()
        code_to_product = {extract_code(p): p for p in product_list if p}
        all_codes = list(code_to_product.keys())

        # Map each code to its subtotal status robustly
        code_to_subtotal = {}
        for _, row in df_products.dropna(subset=["products"]).iterrows():
            p = row["products"]
            c = extract_code(p)
            sub = row.get("is_subtotal")
            
            # Robust boolean conversion
            is_sub = False
            if pd.notna(sub):
                if isinstance(sub, bool):
                    is_sub = sub
                else:
                    is_sub = str(sub).strip().lower() in ("true", "1", "yes")
            code_to_subtotal[c] = is_sub

        # Determine candidates
        candidate_codes = []
        for code in all_codes:
            is_sub = code_to_subtotal.get(code, False)
            has_children = any(other.startswith(code + ".") for other in all_codes if other != code)

            # Exact logical rule:
            # - If is_subtotal == False: It is a candidate.
            # - If is_subtotal == True: It is ONLY a candidate if it has NO children.
            if not is_sub:
                is_candidate = True
            else:
                is_candidate = not has_children

            if is_candidate:
                # Strict upper boundary prefix check: exclude >= 19
                prefix = None
                first_part = code.split(".")[0]
                try:
                    prefix = float(first_part)
                except ValueError:
                    pass

                if prefix is not None and prefix >= 19:
                    continue

                candidate_codes.append(code)

        candidate_product_names = {code_to_product[code] for code in candidate_codes}

        # Filter the dataset for matching rows
        filtered_df = df_macro[
            (df_macro["economy"] == economy) & 
            (df_macro["flows"] == flow) & 
            (df_macro["products"].isin(candidate_product_names))
        ]

        # Structure output, filtering out strictly zero-value/NaN fuels
        active_fuels: List[Dict[str, Any]] = []
        for _, row in filtered_df.iterrows():
            val = float(row[year_str])
            if pd.isna(val) or val == 0.0:
                continue
            fuel_name = str(row["products"])
            active_fuels.append({
                "fuel_id": fuel_name,
                "value": val,
                "code": extract_code(fuel_name)
            })

        return active_fuels

    def get_economy_gdp(self, economy_code: str, file_path: str = "data/economy_data.csv") -> float:
        try:
            import os
            import pandas as pd
            if not os.path.exists(file_path):
                alt_path = os.path.join(os.path.dirname(__file__), "..", "data", "economy_data.csv")
                if os.path.exists(alt_path):
                    file_path = alt_path
                else:
                    return 1.0
            df = pd.read_csv(file_path)
            # Economy code format is like '20USA' or '20 USA', match carefully or use 'in'
            match = df[df['ID'].astype(str).str.contains(economy_code[:2])]
            if not match.empty:
                return float(match.iloc[0]['GDP (2021 USD billion PPP)'])
            return 1.0
        except Exception:
            return 1.0

