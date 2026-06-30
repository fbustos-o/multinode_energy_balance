---
title: Multinode Energy Modeler
emoji: ⚡
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Multinode Energy Modeler (v10)
An interactive full-stack modeling and mathematical optimization platform designed to reconcile bottom-up user-defined energy demand structures with top-down macroeconomic energy datasets. Developed for **APEC (Asia-Pacific Economic Cooperation)** and **APERC (Asia Pacific Energy Research Centre)**, this application allows energy modelers to define customizable sector hierarchies, assign relative weights and physical fuel shares, check for mass balances, mathematically optimize weights to match macro targets, and export ready-to-use configurations directly to the **LEAP (Low Emissions Analysis Platform)** software.

---

## Table of Contents
1. [Overview & What It Does](#overview--what-it-does)
2. [Key Features & Capabilities](#key-features--capabilities)
3. [Directory Architecture](#directory-architecture)
4. [Technology Stack](#technology-stack)
5. [How to Run (Back-End Setup)](#how-to-run-back-end-setup)
6. [How to Run (Front-End Setup)](#how-to-run-front-end-setup)
7. [Mathematical Optimization Framework](#mathematical-optimization-framework)
8. [Typical Modeler Workflow](#typical-modeler-workflow)

---

## Overview & What It Does

In energy planning, reconciling detailed, bottom-up demand sector assumptions (e.g., appliances, heating methods, transport usage) with top-down official statistics (like those from the APEC Energy Statistics database) is a challenging task. Imbalances between bottom-up aggregates and top-down targets are common.

The **Multinode Energy Modeler** solves this by bridging the two approaches:
1. **Macro Baseline Seeding:** It queries an official APEC macroeconomic energy balance database (`00APEC_2024_low.csv`) to set top-down targets for a chosen economy (e.g., USA, Japan, China), sector/flow (e.g., Residential, Transport, Commercial), and year.
2. **Interactive Hierarchical Modeling:** Modelers build a nested tree structure of sub-branches representing the economy's energy distribution. Leaf nodes are populated with real-world physical fuels.
3. **Imbalance Analysis:** It cascades energy values down through the user's weights to the fuels and flags differences against the database's actual macro fuel targets.
4. **SLSQP Optimization:** Utilizing SciPy, it adjusts the tree's relative weights mathematically (respecting optional user-defined minimum and maximum weight bounds) to eliminate physical fuel imbalances.
5. **Structured LEAP Export:** Once optimized and validated, it exports the balanced model tree along with custom socio-economic drivers (such as Households, Floor Area, or Occupancy Rates) to an Excel workbook formatted for direct import into the LEAP energy planning platform.

---

## Key Features & Capabilities

- 📊 **APEC Database Preloading:** Optimized O(1) / O(log N) data slicing using a Pandas MultiIndex on a 36MB+ database.
- 🌳 **Dynamic Tree Constructor:** Interactive, responsive drag-free nested node tree editing (add sub-branches, change node names, attach fuels, customize efficiencies).
- ⚖️ **Validation Engine:** Real-time visual progress bars showing current fuel energy allocations vs. top-down targets.
- ⚙️ **SLSQP Optimization Solver:** Runs sequential least-squares programming under mathematical equality constraints (sibling weights sum to 1.0) and boundary constraints (user-defined min/max weights). 
- 🧬 **Automated Balancing Node Injection:** Instantly injects an "Other Demand" / "Unspecified Uses" balancing node to capture left-over target residuals.
- 📈 **Custom Socio-Economic Drivers:** Create, configure, and bind custom macro-drivers (GDP, Households, Floor Area) dynamically to individual branches.
- 📁 **LEAP Integration:** One-click automated rendering of structured Excel files for LEAP integration.

### What's New in v10
- 🔒 **Database Authentication & Security:** Introduced a full-fledged SQLite user authentication and authorization system.
- ⏳ **Multi-Year Macro Synchronization:** Dynamic synchronization of macro driver targets (Total Energy) in multi-year projection modes, accurately projecting balances across simulated years (e.g., Base Year vs 2035).
- 🧠 **Multi-Year Telemetry Engine:** Robust dictionary-based saving mechanism for optimized telemetry across multiple scenario years simultaneously, equipped with backward compatibility for legacy save files.
- 🎨 **Adaptive Theme Contrast:** Upgraded multi-year Results Summary dashboards utilizing Tailwind CSS arbitrary variants (`[.light-theme_&]`) that perfectly integrate with the app's custom Light/Dark theme toggle.
- ⚡ **Real-Time UI Imbalance Syncing:** The top-down vs bottom-up imbalance labels and colors now instantly update when energy values are modified during projection modeling.
- 🖥️ **Ergonomic Workspace Scaling:** Completely overhauled Tree Canvas layout featuring an un-collapsible workspace (minimum 800px) relying on smooth native browser vertical scrolling for uninterrupted node dragging.

---

## Directory Architecture

```text
v10/
├── back-end/
│   ├── energy_modeler.db           # SQLite database for Users, auth, and state persistence
│   ├── main.py                     # FastAPI initialization, CORS, global exceptions
│   ├── seed_users.py               # Bootstrap script to seed initial admin/users
│   ├── api/
│   │   ├── auth_router.py          # Authentication API endpoints (Login, Register)
│   │   ├── routers.py              # API endpoint routes (Initialize, Validate, Optimize, Export)
│   │   └── schemas.py              # Pydantic schemas for strict request/response validation
│   ├── core/
│   │   ├── auth.py                 # JWT token generation, password hashing & verification
│   │   ├── database.py             # SQLAlchemy configuration and session management
│   │   ├── data_ingestion.py       # APEC Database loader using Pandas MultiIndex slicing
│   │   ├── leap_exporter.py        # Structured Excel sheet compiler for LEAP imports
│   │   ├── models.py               # SQLAlchemy ORM definitions for tables (e.g., Users)
│   │   ├── optimization_engine.py  # SciPy SLSQP optimization & imbalance validation logic
│   │   └── tree_components.py      # Object-oriented tree, node, and fuel data structures
│   └── data/
│       ├── 00APEC_2024_low.csv                   # Core APEC energy database
│       ├── economy_data.csv                      # Additional socio-economic mappings
│       ├── esto_flows_codes_to_names.csv         # Internal code mappings for flow sectors
│       └── esto_products_codes_to_names.csv      # Internal code mappings for products/fuels
│
├── front-end/
│   ├── index.html                  # Main dashboard layout (Tailwind CSS, clean font styling)
│   ├── styles.css                  # Custom styles, theme overrides (.light-theme) and animations
│   ├── api.js                      # HTTP fetch client wrapping API communication (w/ JWT tokens)
│   └── app.js                      # Core UI rendering, interactive tree building, and state manager
│
├── requirements.txt                # Back-end dependencies
└── README.md                       # Comprehensive project documentation
```

---

## Technology Stack

### Back-End:
- **Core Framework:** Python 3.10+ / FastAPI
- **Database:** SQLite & SQLAlchemy (ORM)
- **Security:** Passlib (Bcrypt) & Python-Jose (JWT)
- **Data Engineering:** Pandas & NumPy
- **Mathematical Solver:** SciPy (`scipy.optimize.minimize` using `SLSQP`)
- **Excel Generation:** OpenPyXL
- **Server:** Uvicorn

### Front-End:
- **Core Structure:** HTML5 (Semantic elements, modern viewport standards)
- **Styling:** CSS3 & Tailwind CSS (Loaded via CDN)
- **Logic & API Communication:** Vanilla ES6+ JavaScript (Fetch API, dynamic DOM rendering, state management)

---

## How to Run (Back-End Setup)

Follow these steps to run the high-performance FastAPI server locally:

### 1. Prerequisites
Ensure you have **Python 3.10 or 3.11** installed on your system.

### 2. Navigate and Create a Virtual Environment
Open your terminal in the project root directory and navigate to the `back-end` directory:
```bash
cd back-end
```

Create a virtual environment (highly recommended):
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
Install all the required Python packages from the root `requirements.txt`:
```bash
pip install -r ../requirements.txt
```

### 4. Database Initialization
Seed the initial database and users before running for the first time:
```bash
python seed_users.py
```

### 5. Start the Application
Run the master script to start the Uvicorn server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
*(Note: Use the exact uvicorn command based on your standard boot process if `run.py` was removed in v10).*

> [!TIP]
> Once running, you can explore and test the interactive API documentation directly via **Swagger UI** at `http://localhost:8000/docs` or **Redoc** at `http://localhost:8000/redoc`.

---

## How to Run (Front-End Setup)

Since the frontend consists of static vanilla files (`index.html`, `styles.css`, `api.js`, `app.js`) communicating directly with the backend at `http://localhost:8000`, running it is incredibly simple. Choose any of the following options:

### Option 1: Serve via Python (Recommended)
You can quickly host the static files on a lightweight web server using Python's built-in HTTP module. Open a new terminal in the project root folder and execute:
```bash
python -m http.server 3000 --directory front-end
```
Then, open your web browser and navigate to: **`http://localhost:3000`**

### Option 2: Serve via Node.js
If you have Node.js installed, you can use the standard `http-server` or `live-server` modules:
```bash
npx http-server front-end -p 3000
```
Then, open your web browser and navigate to: **`http://localhost:3000`**

### Option 3: Direct File Execution
You can double-click **`front-end/index.html`** to open it directly in a browser (utilizing the `file://` protocol). 

> [!NOTE]
> The backend server has CORSMiddleware fully enabled with `allow_origins=["*"]`, allowing it to receive requests from local files (`null` origin) smoothly. However, serving via **Option 1** or **Option 2** is recommended to prevent any strict browser restrictions.

---

## Mathematical Optimization Framework

The core backend solver formulates the weight-balancing problem as a **constrained non-linear minimization** using **Sequential Least Squares Programming (SLSQP)**.

### Variables ($x$)
The optimization variables represent the relative weights of the active sub-branches and physical fuels throughout the hierarchical tree structure.

### Constraints
1. **Sum-to-One Sibling Constraints (Equality):**
   For any group of sibling nodes (or fuels) sharing a single parent node, their relative weights must sum up to exactly $1.0$ ($100\%$):
   $$\sum_{i \in \text{siblings}} w_i = 1.0$$
2. **User-Defined Boundaries (Inequality):**
   Modelers can input explicit minimum ($min\_weight$) and maximum ($max\_weight$) bounds on individual nodes. If unspecified, they default to standard boundary limits:
   $$0.0 \le w_i \le 1.0$$

### Objective Function
The engine minimizes the **Sum of Squared Normalized Errors (SSE)** between the calculated energy allocations ($\hat{E}$) and the top-down macroeconomic APEC/ESTO target limits ($E$) for all active fuels ($F$):
$$\min_{x} \sum_{f \in F} \left( \frac{\hat{E}_f(x) - E_f}{\max(E_f, 10^{-6})} \right)^2$$

This formulation ensures that the optimizer prioritizes matching larger fuel flows accurately while keeping relative adjustments balanced. 

> [!TIP]
> **"Vanishing Small Fuels" Consideration:** Because the objective function is quadratic, large physical fuels (e.g., Electricity) disproportionately penalize the optimizer compared to small fuels (e.g., Kerosene). In scenarios of severe "Energy Famine" (where top-down demand heavily outweighs supply limits), the optimizer will naturally sacrifice and zero out smaller fuels to allocate every possible drop of energy to larger sectors.

---

## Typical Modeler Workflow

1. **Login & Authenticate:** Use your secure credentials to log into the UI (JWT Token).
2. **Initialize Environment:** Select your target **Economy** (e.g. `20USA`), **Year** (e.g. `2022`), and **Sector Flow** (e.g. `16.02 Residential`), then click **Initialize Model**. This locks the environment and pre-loads top-down macroeconomic fuel thresholds.
3. **Build Your Tree:** Use `+ Add Root Branch` and `+ Sub-Branch` to outline your demand tree structure (e.g. Space Heating, Air Conditioning, Lighting).
4. **Assign Fuels:** Click `+ Fuel` on leaf nodes to attach physical fuels and input baseline efficiencies (e.g., standard heat pumps have $\eta = 3.0$, gas furnaces have $\eta = 0.9$).
5. **Input Custom Drivers:** Add macro-driver parameters (GDP, Households) in the left panel and bind them to specific branches.
6. **Check Balance:** Click **Check Balance** to run the forward energy allocation pass and inspect imbalances. If imbalances are found, the app will offer to inject a **Balancing Node** to catch missing residuals.
7. **Mathematically Optimize:** Click **Optimize Weights** to run the SLSQP algorithm. The solver will automatically adjust weights within your bounds to perfectly match APEC/ESTO targets.
8. **Export to LEAP:** Click **Export to LEAP** to generate the Excel configuration workbook, saving it in the `output/` directory, ready to be imported into LEAP!