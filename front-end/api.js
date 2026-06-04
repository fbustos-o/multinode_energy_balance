const API_BASE = "http://127.0.0.1:8000/api";

function getAuthHeaders() {
    const token = localStorage.getItem('access_token');
    const headers = { "Content-Type": "application/json" };
    if (token) {
        headers["Authorization"] = "Bearer " + token;
    }
    return headers;
}

export async function registerUser(username, email, password) {
    const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Registration failed");
    }
    return res.json();
}

export async function loginUser(username, password) {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Login failed");
    }
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('is_admin', data.is_admin);
    return data;
}

export function logoutUser() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('is_admin');
}


/**
 * Maps the UI economy code (e.g. "01_AUS") to the backend database code (e.g. "01AUS")
 */
function cleanEconomyCode(code) {
    return code ? code.replace("_", "") : "";
}

/**
 * Lists all projects from the database (for the Welcome Modal load list).
 */
export async function fetchProjects() {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) {
        throw new Error("Failed to retrieve the projects list.");
    }
    return res.json();
}

/**
 * Retrieves the full metadata and all multi-year scenarios of a specific project.
 */
export async function fetchProjectDetails(projectId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}`);
    if (!res.ok) {
        throw new Error(`Failed to load details for Project ID ${projectId}.`);
    }
    return res.json();
}

/**
 * Creates a brand new energy modeling project and automatically builds its base scenario.
 */
export async function createProject(economy, sectorFlow, baseYear) {
    const cleanedEconomy = cleanEconomyCode(economy);
    const res = await fetch(`${API_BASE}/projects`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
            economy: cleanedEconomy, 
            sector_flow: sectorFlow,
            base_year: parseInt(baseYear)
        })
    });
    if (res.status === 401) throw new Error("401_UNAUTHORIZED");
    if (!res.ok) {
        throw new Error("Failed to initialize the new project.");
    }
    return res.json();
}

/**
 * Registers a new scenario (year projection state) under an existing parent project.
 */
export async function createScenario(projectId, name, targetYear, treeState = {}, macroDrivers = {}) {
    const res = await fetch(`${API_BASE}/projects/${projectId}/scenarios`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
            name: name || `Year ${targetYear}`,
            target_year: parseInt(targetYear),
            tree_state: treeState || {},
            macro_drivers: macroDrivers || {}
        })
    });
    if (res.status === 401) throw new Error("401_UNAUTHORIZED");
    if (!res.ok) {
        throw new Error("Failed to build scenario for the project.");
    }
    return res.json();
}

/**
 * Saves a mutated tree structure state and/or updates metadata of a scenario.
 */
export async function updateScenario(scenarioId, data) {
    const res = await fetch(`${API_BASE}/scenarios/${scenarioId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
    });
    if (res.status === 401) throw new Error("401_UNAUTHORIZED");
    if (!res.ok) {
        throw new Error(`Failed to save changes for Scenario ID ${scenarioId}.`);
    }
    return res.json();
}

/**
 * Submits the scenario tree state to the SLSQP mathematical optimizer, 
 * returning the re-weighted, balanced tree structure.
 */
export async function optimizeScenario(scenarioId, targetTotal = null) {
    const res = await fetch(`${API_BASE}/scenarios/${scenarioId}/optimize`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ target_total: targetTotal ? parseFloat(targetTotal) : null })
    });
    if (res.status === 401) throw new Error("401_UNAUTHORIZED");
    if (!res.ok) {
        const errDetails = await res.json().catch(() => ({}));
        throw new Error(errDetails.detail || "Mathematical optimization failed.");
    }
    return res.json();
}

/**
 * Gathers all active projections of a project and exports LEAP interp() functions.
 * format: 'json' or 'excel'. If 'excel', prompts a browser download session.
 */
export async function exportLEAP(projectId, format = "json") {
    if (format === "excel") {
        window.open(`${API_BASE}/projects/${projectId}/export?format=excel`, "_blank");
        return;
    }
    const res = await fetch(`${API_BASE}/projects/${projectId}/export?format=json`, {
        method: "POST"
    });
    if (!res.ok) {
        throw new Error("LEAP export compilation failed.");
    }
    return res.json();
}

/**
 * Deletes a project from the database.
 */
export async function deleteProject(projectId) {
    const res = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: "DELETE"
    });
    if (!res.ok) {
        throw new Error(`Failed to delete Project ID ${projectId}.`);
    }
    return true;
}

/**
 * Deletes a scenario from the database.
 */
export async function deleteScenario(scenarioId) {
    const res = await fetch(`${API_BASE}/scenarios/${scenarioId}`, {
        method: "DELETE"
    });
    if (!res.ok) {
        throw new Error(`Failed to delete Scenario ID ${scenarioId}.`);
    }
    return true;
}

/**
 * Generates a stateless scenario template via in-memory backend generation.
 */
export async function fetchStatelessTemplate(economy, sectorFlow, targetYear) {
    const cleanedEconomy = cleanEconomyCode(economy);
    const res = await fetch(`${API_BASE}/stateless/template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            economy: cleanedEconomy,
            sector_flow: sectorFlow,
            target_year: parseInt(targetYear)
        })
    });
    if (!res.ok) {
        throw new Error("Failed to generate stateless template.");
    }
    return res.json();
}

/**
 * Submits the scenario tree state to the SLSQP mathematical optimizer without DB writes, 
 * returning the re-weighted, balanced tree structure.
 */
export async function optimizeStatelessTree(treeState, targetTotal, macroDrivers, activeFuels) {
    const res = await fetch(`${API_BASE}/stateless/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            tree_state: treeState,
            target_total: targetTotal ? parseFloat(targetTotal) : 100.0,
            macro_drivers: macroDrivers || {},
            active_fuels: activeFuels || []
        })
    });
    if (!res.ok) {
        const errDetails = await res.json().catch(() => ({}));
        throw new Error(errDetails.detail || "Stateless mathematical optimization failed.");
    }
    return res.json();
}

/**
 * Imports a full scenario JSON payload to the database.
 */
export async function importScenario(jsonData) {
    const res = await fetch(`${API_BASE}/scenarios`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(jsonData)
    });
    if (res.status === 401) throw new Error("401_UNAUTHORIZED");
    if (!res.ok) {
        throw new Error("Failed to import scenario to database.");
    }
    return res.json();
}

