import { 
    fetchProjects, 
    fetchProjectDetails, 
    createProject, 
    createScenario, 
    updateScenario, 
    optimizeScenario, 
    exportLEAP,
    deleteProject,
    deleteScenario,
    fetchStatelessTemplate,
    optimizeStatelessTree,
    importScenario,
    loginUser,
    registerUser,
    logoutUser
} from "./api.js";

// ================= HELPER FUNCTIONS =================
function getActiveFuelsArray() {
    if (!state.selectedScenario || !state.selectedScenario.active_fuels) return [];
    let fuels = state.selectedScenario.active_fuels;
    if (Array.isArray(fuels)) return fuels;
    return fuels[state.activeYear] || fuels["base_year"] || [];
}

function getActiveTargetTotal() {
    if (state.activeYear !== "base_year" && state.selectedScenario && state.selectedScenario.macro_drivers && state.selectedScenario.macro_drivers[state.activeYear]) {
        if (state.selectedScenario.macro_drivers[state.activeYear].target_total !== undefined) {
            return parseFloat(state.selectedScenario.macro_drivers[state.activeYear].target_total) || 100.0;
        }
    }
    return parseFloat(macroTargetTotal.value) || 100.0;
}

// ================= STATE MANAGEMENT =================
let state = {
    projects: [],
    selectedProject: null,
    selectedScenario: null,
    currentScenarioId: null,
    projectScenarios: [],   // All scenarios under the active project
    treeState: null,        // Local in-memory modified tree of the active scenario
    telemetry: null,
    activeTab: "new",       // "new" or "load"
    activeView: "canvas",   // "canvas" or "comparison"
    activeYear: "base_year",
    unsaved: false          // Track unsaved state
};

let pendingSaveAction = null;

// ================= DOM ELEMENT SELECTORS =================
const welcomeModal = document.getElementById("welcome-modal");
const appWorkspace = document.getElementById("app-workspace");

// Welcome tabs
const tabNewBtn = document.getElementById("tab-new-btn");
const tabLoadBtn = document.getElementById("tab-load-btn");
const tabNewView = document.getElementById("tab-new-view");
const tabLoadView = document.getElementById("tab-load-view");

// New scenario inputs
const newScenarioName = document.getElementById("new-scenario-name");
const newEconomy = document.getElementById("new-economy");
const newYear = document.getElementById("new-year");
const newSector = document.getElementById("new-sector");
const createProjectBtn = document.getElementById("create-project-btn");

// Load scenario list
const savedScenariosContainer = document.getElementById("saved-scenarios-container");
const loadProjectBtn = document.getElementById("load-project-btn");

// Workspace headers/badges
const badgeEconomy = document.getElementById("badge-economy");
const badgeSector = document.getElementById("badge-sector");
const badgeYear = document.getElementById("badge-year");
const activeScenarioName = document.getElementById("active-scenario-name");
const activeScenarioDetails = document.getElementById("active-scenario-details");

// Center pane headers & buttons
const centerPaneTitle = document.getElementById("center-pane-title");
const centerPaneSubtitle = document.getElementById("center-pane-subtitle");

// Sidebar macro inputs and execution actions
const macroTargetTotal = document.getElementById("macro-target-total");
const saveModelBtn = document.getElementById("save-model-btn");
const downloadJsonBtn = document.getElementById("download-json-btn");
const checkBalanceBtn = document.getElementById("check-balance-btn");
const optimizeBtn = document.getElementById("optimize-btn");
const exportLeapBtn = document.getElementById("export-leap-btn");
const optimizationMsgBox = document.getElementById("optimization-msg-box");
const exitBtn = document.getElementById("exit-btn");

// Dynamic Macro Driver Sidebar elements
const addMacroSelect = document.getElementById("add-macro-select");
const customDriverNameWrapper = document.getElementById("custom-driver-name-wrapper");
const addMacroCustomName = document.getElementById("add-macro-custom-name");
const addMacroBtn = document.getElementById("add-macro-btn");
const activeMacroDriversContainer = document.getElementById("active-macro-drivers-container");
const fuelTargetsContainer = document.getElementById("fuel-targets-container");

// Tree Canvas & Comparison containers
const treeCanvasContainer = document.getElementById("tree-canvas-container");
const comparisonViewContainer = document.getElementById("comparison-view-container");
const addMainBranchBtn = document.getElementById("add-main-branch-btn");

// Zoom & Compact Mode DOM controls
const zoomOutBtn = document.getElementById("zoom-out-btn");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomLevelBadge = document.getElementById("zoom-level-badge");
const compactModeChk = document.getElementById("compact-mode-chk");

let canvasZoom = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

let draggingNode = null;
let dragStartX = 0;
let dragStartY = 0;
let initialTx = 0;
let initialTy = 0;

// Projections Tabs, Add & Compare Buttons
const projectionsTabsContainer = document.getElementById("projections-tabs-container");
const addProjectionBtn = document.getElementById("add-projection-btn");

const resultsSummaryBtn = document.getElementById("results-summary-btn");
const resultsViewContainer = document.getElementById("results-view-container");
const statBottomUp = document.getElementById("stat-bottom-up");
const statTopDown = document.getElementById("stat-top-down");
const statImbalance = document.getElementById("stat-imbalance");

// ================= AUTH UI DOM =================
const authLoginBtn = document.getElementById("auth-login-btn");
const authLogoutBtn = document.getElementById("auth-logout-btn");
const authModal = document.getElementById("auth-modal");
const authCloseBtn = document.getElementById("auth-close-btn");
const authForm = document.getElementById("auth-form");
const authUsername = document.getElementById("auth-username");
const authEmail = document.getElementById("auth-email");
const authEmailContainer = document.getElementById("auth-email-container");
const authPassword = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authTitle = document.getElementById("auth-title");
const authErrorMsg = document.getElementById("auth-error-msg");

// ================= ADMIN UI DOM =================
const btnAdminPanel = document.getElementById("btn-admin-panel");
const btnBackModeler = document.getElementById("btn-back-modeler");
const viewModeler = document.getElementById("view-modeler");
const viewAdmin = document.getElementById("view-admin");
const adminCreateUserForm = document.getElementById("admin-create-user-form");
const adminUsersTableBody = document.getElementById("admin-users-table-body");

function updateAuthUI() {
    const token = localStorage.getItem("access_token");
    const isAdmin = localStorage.getItem("is_admin") === "true";
    if (token) {
        if (authLoginBtn) authLoginBtn.classList.add("hidden");
        if (authLogoutBtn) authLogoutBtn.classList.remove("hidden");
        if (btnAdminPanel && isAdmin) {
            btnAdminPanel.classList.remove("hidden");
        } else if (btnAdminPanel) {
            btnAdminPanel.classList.add("hidden");
        }
    } else {
        if (authLoginBtn) authLoginBtn.classList.remove("hidden");
        if (authLogoutBtn) authLogoutBtn.classList.add("hidden");
        if (btnAdminPanel) btnAdminPanel.classList.add("hidden");
    }
}

function showAuthModal() {
    if (authModal) authModal.classList.remove("hidden");
}

function hideAuthModal() {
    if (authModal) authModal.classList.add("hidden");
    if (authForm) authForm.reset();
    if (authErrorMsg) authErrorMsg.classList.add("hidden");
}

// ================= WELCOME WINDOW INITIALIZATION =================
window.addEventListener("DOMContentLoaded", () => {
    initTheme();
    populateYearDropdown();
    initWelcomeFlow();
    updateAuthUI();
    
    // Auth Listeners
    if (authLoginBtn) authLoginBtn.addEventListener("click", showAuthModal);
    if (authCloseBtn) authCloseBtn.addEventListener("click", hideAuthModal);
    if (authLogoutBtn) authLogoutBtn.addEventListener("click", () => {
        logoutUser();
        updateAuthUI();
        if (viewAdmin && !viewAdmin.classList.contains("hidden")) {
            viewAdmin.classList.add("hidden");
            if (viewModeler) viewModeler.classList.remove("hidden");
        }
    });

    if (btnAdminPanel) {
        btnAdminPanel.addEventListener("click", () => {
            if (viewModeler) viewModeler.classList.add("hidden");
            if (viewAdmin) viewAdmin.classList.remove("hidden");
            fetchAndRenderUsers();
        });
    }

    if (btnBackModeler) {
        btnBackModeler.addEventListener("click", () => {
            if (viewAdmin) viewAdmin.classList.add("hidden");
            if (viewModeler) viewModeler.classList.remove("hidden");
        });
    }

    if (adminCreateUserForm) {
        adminCreateUserForm.addEventListener("submit", handleCreateUser);
    }
    
    if (authForm) {
        authForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            authErrorMsg.classList.add("hidden");
            const originalBtnHtml = authSubmitBtn.innerHTML;
            authSubmitBtn.disabled = true;
            authSubmitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Processing...`;
            
            try {
                await loginUser(authUsername.value, authPassword.value);
                updateAuthUI();
                hideAuthModal();
                
                if (pendingSaveAction) {
                    console.log("Retrying pending action after successful login...");
                    const action = pendingSaveAction;
                    pendingSaveAction = null;
                    await action();
                }
            } catch (err) {
                authErrorMsg.innerText = err.message;
                authErrorMsg.classList.remove("hidden");
            } finally {
                authSubmitBtn.disabled = false;
                authSubmitBtn.innerHTML = originalBtnHtml;
            }
        });
    }
});

// ================= ADMIN FUNCTIONS =================
async function fetchAndRenderUsers() {
    try {
        const token = localStorage.getItem("access_token");
        const res = await fetch("http://127.0.0.1:8000/api/auth/admin/users", {
            headers: {
                "Authorization": "Bearer " + token
            }
        });
        if (!res.ok) throw new Error("Failed to fetch users");
        const users = await res.json();
        
        if (adminUsersTableBody) {
            adminUsersTableBody.innerHTML = users.map(u => `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="px-4 py-3 font-semibold text-slate-800">#${u.id}</td>
                    <td class="px-4 py-3">
                        <div class="font-bold text-slate-800">${u.username}</div>
                        <div class="text-xs text-slate-500">${u.email}</div>
                    </td>
                    <td class="px-4 py-3">
                        ${u.is_admin ? '<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">Admin</span>' : '<span class="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold">User</span>'}
                    </td>
                    <td class="px-4 py-3 font-mono text-xs text-slate-500 break-all w-48">${u.api_key || '<em class="text-slate-400">None</em>'}</td>
                    <td class="px-4 py-3">
                        ${u.valid_until ? new Date(u.valid_until).toLocaleDateString() : '<em class="text-slate-400">Never</em>'}
                    </td>
                </tr>
            `).join("");
        }
    } catch (err) {
        console.error("Error fetching users:", err);
    }
}

async function handleCreateUser(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin mr-2"></i>Processing...';

    const username = document.getElementById("admin-new-username").value;
    const email = document.getElementById("admin-new-email").value;
    const password = document.getElementById("admin-new-password").value;
    const isAdmin = document.getElementById("admin-new-isadmin").checked;
    const validUntilRaw = document.getElementById("admin-new-expiration").value;
    const validUntil = validUntilRaw ? new Date(validUntilRaw).toISOString() : null;

    try {
        const token = localStorage.getItem("access_token");
        const res = await fetch("http://127.0.0.1:8000/api/auth/admin/users", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password,
                is_admin: isAdmin,
                valid_until: validUntil
            })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.detail || "Failed to create user");
        }

        alert(`User created successfully!\n\nUsername: ${data.username}\nAPI Key: ${data.api_key}\n\nPlease copy the API Key now, as it will not be shown again.`);
        event.target.reset();
        fetchAndRenderUsers();
    } catch (err) {
        alert("Error creating user: " + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    const body = document.body;
    
    const themeBtn = document.getElementById("theme-toggle-btn");
    const themeIcon = document.getElementById("theme-icon");
    const welcomeBtn = document.getElementById("welcome-theme-toggle-btn");
    const welcomeIcon = welcomeBtn ? welcomeBtn.querySelector(".welcome-theme-icon") : null;

    const updateThemeUI = (theme) => {
        if (theme === "light") {
            body.classList.add("light-theme");
            if (themeIcon) themeIcon.className = "fa-solid fa-moon text-sm";
            if (welcomeIcon) welcomeIcon.className = "welcome-theme-icon fa-solid fa-moon text-sm";
            if (themeBtn) {
                themeBtn.className = "w-9 h-9 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg flex items-center justify-center transition-all border border-slate-300";
            }
            if (welcomeBtn) {
                welcomeBtn.className = "absolute top-4 right-4 w-9 h-9 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg flex items-center justify-center transition-all border border-slate-300 z-50 shadow-lg";
            }
        } else {
            body.classList.remove("light-theme");
            if (themeIcon) themeIcon.className = "fa-solid fa-sun text-sm";
            if (welcomeIcon) welcomeIcon.className = "welcome-theme-icon fa-solid fa-sun text-sm";
            if (themeBtn) {
                themeBtn.className = "w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center transition-all border border-slate-700";
            }
            if (welcomeBtn) {
                welcomeBtn.className = "absolute top-4 right-4 w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center transition-all border border-slate-700 z-50 shadow-lg";
            }
        }
    };

    // Apply saved theme
    updateThemeUI(savedTheme);

    const toggleTheme = () => {
        const currentTheme = body.classList.contains("light-theme") ? "light" : "dark";
        const nextTheme = currentTheme === "light" ? "dark" : "light";
        localStorage.setItem("theme", nextTheme);
        updateThemeUI(nextTheme);
    };

    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
    if (welcomeBtn) welcomeBtn.addEventListener("click", toggleTheme);
}

function populateYearDropdown() {
    newYear.innerHTML = "";
    // Strictly populate from 1990 to 2022
    for (let y = 2022; y >= 1990; y--) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.innerText = `${y} ${y === 2022 ? '(Default Base)' : ''}`;
        newYear.appendChild(opt);
    }
}

function initWelcomeFlow() {
    tabNewBtn.addEventListener("click", () => switchWelcomeTab("new"));
    tabLoadBtn.addEventListener("click", () => switchWelcomeTab("load"));
    createProjectBtn.addEventListener("click", handleCreateScenario);
    loadProjectBtn.addEventListener("click", handleLoadScenario);
    exitBtn.addEventListener("click", showWelcomeModal);
    
    // Add projection button click handler
    addProjectionBtn.addEventListener("click", handleAddProjection);
    
    // Results Summary click handler
    if (resultsSummaryBtn) {
        resultsSummaryBtn.addEventListener("click", () => {
            if (state.activeView === "results") {
                switchViewMode("canvas");
            } else {
                switchViewMode("results");
            }
        });
    }

    // Import JSON change handler
    const importJsonInput = document.getElementById("import-json-file");
    if (importJsonInput) {
        importJsonInput.addEventListener("change", handleJSONImport);
    }
    
    // Download JSON (Debug) button handler
    if (saveModelBtn) {
        saveModelBtn.addEventListener("click", () => {
            if (!state.treeState || !state.selectedScenario) {
                alert("No active scenario state to download.");
                return;
            }

            // 1. Get contributions map via the cascading top-down math
            const contributions = {};
            const targetVal = getActiveTargetTotal();
            const activeMacroDrivers = state.selectedScenario.macro_drivers ? state.selectedScenario.macro_drivers[state.activeYear] : {};
            calculateNodeContribution(state.treeState, activeMacroDrivers, targetVal, [], contributions);

            // 2. Clone treeState so we can enrich it with calculated energy for the JSON dump
            const clonedTree = JSON.parse(JSON.stringify(state.treeState));
            const enrichNode = (node, nodeEnergy) => {
                node.computed_pj = parseFloat(nodeEnergy.toFixed(4));
                
                if (node.fuels && node.fuels.length > 0) {
                    const totalFuelShare = node.fuels.reduce((sum, fuel) => sum + parseFloat(fuel.share || 0), 0.0);
                    node.fuels.forEach(fuel => {
                        const normalizedShare = totalFuelShare > 0 ? (parseFloat(fuel.share || 0) / totalFuelShare) : 0.0;
                        fuel.computed_pj = parseFloat((nodeEnergy * normalizedShare).toFixed(4));
                    });
                }
                
                if (node.children && node.children.length > 0) {
                    // Loop 1: Calculate apparent weight for each child
                    const apparentWeights = node.children.map(child => {
                        const weight = parseFloat(child.weight || 0);
                        const link = child.macro_driver_link;
                        
                        let scalar = 1.0;
                        if (link && activeMacroDrivers[link] !== undefined) {
                            const val = parseFloat(activeMacroDrivers[link]) || 0.0;
                            let divisor = 1.0;
                            if (link === "households") divisor = 1000.0;
                            else if (link === "floor_area") divisor = 1000.0;
                            else if (link === "occupancy") divisor = 2.5;
                            else if (val > 10.0) divisor = 1000.0;
                            scalar = val / divisor;
                        }
                        return weight * scalar;
                    });
                    
                    const totalApparent = apparentWeights.reduce((sum, w) => sum + w, 0.0);
                    
                    // Loop 2: Calculate childEnergy and recurse
                    node.children.forEach((child, index) => {
                        const apparentWeight = apparentWeights[index];
                        const normWeight = totalApparent > 0 ? (apparentWeight / totalApparent) : 0.0;
                        const childEnergy = nodeEnergy * normWeight;
                        enrichNode(child, childEnergy);
                    });
                }
            };
            enrichNode(clonedTree, targetVal);

            // 3. Build telemetry comparison list for all scenarios
            const esto_targets_vs_system = {};
            if (state.selectedScenario.tree_state) {
                Object.keys(state.selectedScenario.tree_state).forEach(y => {
                    const tempTree = state.selectedScenario.tree_state[y];
                    const tempMacro = state.selectedScenario.macro_drivers ? state.selectedScenario.macro_drivers[y] : {};
                    let tempFuels = state.selectedScenario.active_fuels || [];
                    if (!Array.isArray(tempFuels)) {
                        tempFuels = tempFuels[y] || tempFuels["base_year"] || [];
                    }
                    
                    const tempTargetVal = tempMacro && tempMacro.target_total !== undefined ? tempMacro.target_total : 100.0;
                    const tempContributions = {};
                    calculateNodeContribution(tempTree, tempMacro, tempTargetVal, [], tempContributions);
                    
                    esto_targets_vs_system[y] = tempFuels.map(fuel => {
                        const calculated = tempContributions[fuel.fuel_id] || 0.0;
                        const target = parseFloat(fuel.value) || 0.0;
                        return {
                            fuel_id: fuel.fuel_id,
                            esto_target_pj: target,
                            system_calculated_pj: calculated,
                            variance_pj: calculated - target
                        };
                    });
                });
            }

            const economyClean = (state.selectedProject.economy || "").replace(/[^a-zA-Z0-9]/g, "_");
            const sectorClean = (state.selectedProject.sector_flow || "").replace(/[^a-zA-Z0-9]/g, "_");
            const year = state.selectedScenario.target_year || "UnknownYear";

            const exportObj = {
                economy: state.selectedProject.economy,
                sector_flow: state.selectedProject.sector_flow,
                scenario_name: state.selectedScenario.name,
                target_year: year,
                macro_drivers: state.selectedScenario.macro_drivers,
                active_fuels: state.selectedScenario.active_fuels || [],
                tree_state: state.selectedScenario.tree_state,
                telemetry: {
                    esto_targets_vs_system: esto_targets_vs_system,
                    optimization_count: state.telemetry ? state.telemetry.optimization_count : 0,
                    auto_balance_count: state.telemetry ? state.telemetry.auto_balance_count : 0
                }
            };

            const jsonStr = JSON.stringify(exportObj, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${economyClean}_${year}_${sectorClean}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }
    
    // Show/hide custom name input field depending on the selection
    addMacroSelect.addEventListener("change", () => {
        if (addMacroSelect.value === "custom") {
            customDriverNameWrapper.classList.remove("hidden");
        } else {
            customDriverNameWrapper.classList.add("hidden");
        }
    });

    // Add Macro Driver Button Action
    addMacroBtn.addEventListener("click", () => {
        if (!state.selectedScenario) return;
        if (!state.selectedScenario.macro_drivers) {
            state.selectedScenario.macro_drivers = {};
        }
        if (!state.selectedScenario.macro_drivers[state.activeYear]) {
            state.selectedScenario.macro_drivers[state.activeYear] = {};
        }

        const selectVal = addMacroSelect.value;
        let key = selectVal;
        let defaultValue = 1.0;

        if (selectVal === "custom") {
            key = addMacroCustomName.value.trim();
            if (!key) {
                alert("Please enter a custom driver name.");
                return;
            }
            key = key.toLowerCase().replace(/[^a-z0-9]/g, "_");
        } else {
            if (selectVal === "households") defaultValue = 1000.0;
            else if (selectVal === "floor_area") defaultValue = 50000.0;
            else if (selectVal === "occupancy") defaultValue = 2.5;
        }

        if (state.selectedScenario.macro_drivers[state.activeYear][key] !== undefined) {
            alert(`Macro driver "${key}" already exists.`);
            return;
        }

        state.selectedScenario.macro_drivers[state.activeYear][key] = defaultValue;
        addMacroCustomName.value = "";
        customDriverNameWrapper.classList.add("hidden");
        addMacroSelect.value = "households";

        markUnsaved();
        renderMacroDrivers();
        renderWorkspaceCanvas();
        recalculateTreeEnergy();
    });

    // Active macro drivers list clicks (Remove action)
    activeMacroDriversContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action='remove-macro']");
        if (!btn) return;
        const key = btn.dataset.macroKey;
        if (key && state.selectedScenario && state.selectedScenario.macro_drivers && state.selectedScenario.macro_drivers[state.activeYear]) {
            delete state.selectedScenario.macro_drivers[state.activeYear][key];
            markUnsaved();
            renderMacroDrivers();
            renderWorkspaceCanvas();
            recalculateTreeEnergy();
        }
    });

    // Active macro drivers list values change
    activeMacroDriversContainer.addEventListener("change", (e) => {
        const input = e.target.closest("[data-macro-key]");
        if (!input) return;
        const key = input.dataset.macroKey;
        const val = parseFloat(input.value) || 0.0;
        if (key && state.selectedScenario && state.selectedScenario.macro_drivers && state.selectedScenario.macro_drivers[state.activeYear]) {
            state.selectedScenario.macro_drivers[state.activeYear][key] = val;
            markUnsaved();
            recalculateTreeEnergy();
        }
    });
    
    // Zoom and Pan helper
    function applyTransform() {
        const treePanWrapper = document.getElementById("tree-pan-wrapper");
        if (treePanWrapper) {
            treePanWrapper.style.transform = `translate(${panX}px, ${panY}px) scale(${canvasZoom})`;
        }
        if (zoomLevelBadge) {
            zoomLevelBadge.innerText = `${Math.round(canvasZoom * 100)}%`;
        }
    }

    // Zoom controls listeners
    zoomInBtn.addEventListener("click", () => {
        canvasZoom = Math.min(canvasZoom + 0.1, 2.0);
        applyTransform();
        drawSVGLines();
    });

    zoomOutBtn.addEventListener("click", () => {
        canvasZoom = Math.max(canvasZoom - 0.1, 0.3);
        applyTransform();
        drawSVGLines();
    });

    const resetViewBtn = document.getElementById("reset-view-btn");
    if (resetViewBtn) {
        resetViewBtn.addEventListener("click", () => {
            canvasZoom = 1.0;
            panX = 0;
            panY = 0;
            applyTransform();
            drawSVGLines();
        });
    }

    // Figma-style drag-to-pan AND card dragging on #tree-canvas-container
    treeCanvasContainer.addEventListener("mousedown", (e) => {
        const header = e.target.closest(".tree-card-header");
        // Only drag if clicking the header and NOT clicking inputs, selects, buttons, or icons
        if (header && !e.target.closest("input, select, button, i.fa-trash-can, i.fa-chevron-down")) {
            e.preventDefault(); // Prevent text selection
            e.stopPropagation(); // Stop canvas panning (in case of parents)
            
            const card = header.closest(".tree-node-card");
            draggingNode = card;
            
            initialTx = parseFloat(card.dataset.dragX || 0);
            initialTy = parseFloat(card.dataset.dragY || 0);
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            card.classList.add("is-dragging");
            return;
        }

        if (e.target.closest("input, select, button, textarea, option")) return;
        isPanning = true;
        treeCanvasContainer.style.cursor = "grabbing";
        startX = e.clientX - panX;
        startY = e.clientY - panY;
    });

    window.addEventListener("mousemove", (e) => {
        if (draggingNode) {
            // Calculate delta considering the current zoom level of the canvas
            const dx = (e.clientX - dragStartX) / canvasZoom;
            const dy = (e.clientY - dragStartY) / canvasZoom;
            
            const newX = initialTx + dx;
            const newY = initialTy + dy;
            
            draggingNode.style.transform = `translate(${newX}px, ${newY}px)`;
            draggingNode.dataset.dragX = newX;
            draggingNode.dataset.dragY = newY;
            
            drawSVGLines(); // Redraw lines 60fps
            return;
        }

        if (!isPanning) return;
        panX = e.clientX - startX;
        panY = e.clientY - startY;
        applyTransform();
    });

    window.addEventListener("mouseup", () => {
        if (draggingNode) {
            // Save back to state
            const pathStr = draggingNode.dataset.path;
            const pathArr = pathStr === "" ? [] : pathStr.split(",").map(Number);
            const nodeObj = getNodeByPath(state.treeState, pathArr);
            
            if (nodeObj) {
                nodeObj.ui_x = parseFloat(draggingNode.dataset.dragX);
                nodeObj.ui_y = parseFloat(draggingNode.dataset.dragY);
                markUnsaved();
            }
            
            draggingNode.classList.remove("is-dragging");
            draggingNode = null;
        }

        if (isPanning) {
            isPanning = false;
            treeCanvasContainer.style.cursor = "grab";
        }
    });

    treeCanvasContainer.addEventListener("mouseleave", () => {
        if (isPanning) {
            isPanning = false;
            treeCanvasContainer.style.cursor = "grab";
        }
    });

    // Scroll-to-zoom (wheel event) on #tree-canvas-container
    treeCanvasContainer.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomIntensity = 0.05;
        const delta = e.deltaY < 0 ? 1 : -1;
        const nextZoom = Math.min(Math.max(canvasZoom + delta * zoomIntensity, 0.3), 2.0);

        const rect = treeCanvasContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const relX = (mouseX - panX) / canvasZoom;
        const relY = (mouseY - panY) / canvasZoom;

        canvasZoom = nextZoom;
        panX = mouseX - relX * canvasZoom;
        panY = mouseY - relY * canvasZoom;

        applyTransform();
        drawSVGLines();
    }, { passive: false });

    // Compact mode checkbox listener
    compactModeChk.addEventListener("change", () => {
        const treePanWrapper = document.getElementById("tree-pan-wrapper");
        if (compactModeChk.checked) {
            treeCanvasContainer.classList.add("compact-mode");
            if (treePanWrapper) treePanWrapper.classList.add("compact-mode");
        } else {
            treeCanvasContainer.classList.remove("compact-mode");
            if (treePanWrapper) treePanWrapper.classList.remove("compact-mode");
        }
        drawSVGLines();
    });
    
    // Load lists on startup
    loadProjectsList();
}

function markUnsaved() {
    state.unsaved = true;
    downloadJsonBtn.classList.add("animate-pulse");
    downloadJsonBtn.className = "w-full py-2 px-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-white font-bold text-xs rounded-lg border border-red-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20";
}

function clearUnsaved() {
    state.unsaved = false;
    downloadJsonBtn.classList.remove("animate-pulse");
    downloadJsonBtn.className = "w-full py-2 px-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-bold text-xs rounded-lg border border-red-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20";
}

function renderMacroDrivers() {
    if (!state.selectedScenario || !state.selectedScenario.macro_drivers) return;
    const container = document.getElementById("active-macro-drivers-container");
    if (!container) return;

    container.innerHTML = "";
    
    const drivers = state.selectedScenario.macro_drivers[state.activeYear] || {};
    const keys = Object.keys(drivers).filter(k => k !== "target_total" && k !== "total");

    if (keys.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-[10px] text-slate-600 border border-dashed border-slate-800/80 rounded">
                No active macro drivers. Add one above!
            </div>
        `;
        return;
    }

    keys.forEach(key => {
        const val = drivers[key];
        let label = key;
        if (key === "households") label = "Households (Preset)";
        else if (key === "floor_area") label = "Floor Area (Preset)";
        else if (key === "occupancy") label = "Occupancy (Preset)";
        else if (key === "custom_index") label = "Custom Index (Preset)";

        const div = document.createElement("div");
        div.className = "flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800/60 p-2 rounded-lg";
        div.innerHTML = `
            <div class="flex-1 min-w-0">
                <span class="block text-[9px] text-slate-400 font-bold uppercase truncate">${label}</span>
                <input type="number" step="any" value="${val}" class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-pink-500" data-macro-key="${key}">
            </div>
            <button class="text-slate-500 hover:text-red-400 p-1.5 mt-3 transition-all text-xs" data-action="remove-macro" data-macro-key="${key}">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

function switchWelcomeTab(tab) {
    state.activeTab = tab;
    if (tab === "new") {
        tabNewBtn.className = "text-lg font-bold text-white border-b-2 border-blue-500 pb-2 flex items-center gap-2 transition-all";
        tabLoadBtn.className = "text-lg font-bold text-slate-400 hover:text-white pb-2 flex items-center gap-2 transition-all";
        tabNewView.classList.remove("hidden");
        tabLoadView.classList.add("hidden");
    } else {
        tabLoadBtn.className = "text-lg font-bold text-white border-b-2 border-blue-500 pb-2 flex items-center gap-2 transition-all";
        tabNewBtn.className = "text-lg font-bold text-slate-400 hover:text-white pb-2 flex items-center gap-2 transition-all";
        tabLoadView.classList.remove("hidden");
        tabNewView.classList.add("hidden");
        loadProjectsList();
    }
}

async function loadProjectsList() {
    try {
        state.projects = await fetchProjects();
        renderSavedScenarios();
    } catch (err) {
        console.error("Error loading saved database:", err);
        savedScenariosContainer.innerHTML = `
            <div class="text-center py-8 text-sm text-red-400">
                <i class="fa-solid fa-triangle-exclamation text-lg mb-2"></i>
                <p>Connection to backend database failed.</p>
            </div>
        `;
    }
}

function renderSavedScenarios() {
    if (state.projects.length === 0) {
        savedScenariosContainer.innerHTML = `
            <div class="text-center py-8 text-sm text-slate-500">
                <i class="fa-solid fa-clipboard-question text-2xl mb-2"></i>
                <p>No files saved</p>
            </div>
        `;
        loadProjectBtn.disabled = true;
        loadProjectBtn.className = "w-full bg-gradient-to-r from-slate-700 to-slate-600 text-slate-400 cursor-not-allowed font-bold py-3 px-6 rounded-lg transition-all text-sm mt-4 flex items-center justify-center gap-2";
        return;
    }

    savedScenariosContainer.innerHTML = "";
    
    state.projects.forEach(project => {
        fetchProjectDetails(project.id).then(details => {
            if (details.scenarios && details.scenarios.length > 0) {
                details.scenarios.forEach(scen => {
                    const scenCard = document.createElement("div");
                    scenCard.className = "flex justify-between items-center bg-slate-900 hover:bg-slate-800/80 border border-slate-800/60 hover:border-slate-700/80 px-4 py-3 rounded-lg cursor-pointer transition-all";
                    scenCard.dataset.projectId = project.id;
                    scenCard.dataset.scenarioId = scen.id;
                    
                    scenCard.innerHTML = `
                        <div class="flex items-center gap-3">
                            <i class="fa-solid fa-diagram-project text-blue-400"></i>
                            <div>
                                <h4 class="text-sm font-bold text-white">${scen.name}</h4>
                                <span class="text-[10px] text-slate-400 uppercase">
                                    ${project.economy} • ${project.sector_flow} • Year: ${scen.target_year}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <button class="text-slate-500 hover:text-blue-400 p-1.5 transition-all text-xs btn-edit-scenario" title="Edit Scenario Name">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="text-slate-500 hover:text-red-400 p-1.5 transition-all text-xs btn-delete-scenario" title="Delete Scenario">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                            <button class="text-slate-500 hover:text-rose-600 p-1.5 transition-all text-xs btn-delete-project" title="Delete Entire Project (All Scenarios)">
                                <i class="fa-solid fa-folder-minus"></i>
                            </button>
                            <i class="fa-solid fa-chevron-right text-slate-600 text-xs ml-1"></i>
                        </div>
                    `;

                    const editBtn = scenCard.querySelector(".btn-edit-scenario");
                    editBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        const newName = prompt("Enter new name for the scenario:", scen.name);
                        if (newName && newName.trim()) {
                            try {
                                await updateScenario(scen.id, { name: newName.trim() });
                                loadProjectsList();
                            } catch (err) {
                                alert("Failed to update scenario name: " + err.message);
                            }
                        }
                    });

                    const deleteBtn = scenCard.querySelector(".btn-delete-scenario");
                    deleteBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete the scenario "${scen.name}"?`)) {
                            try {
                                await deleteScenario(scen.id);
                                if (state.selectedScenario && state.selectedScenario.id === scen.id) {
                                    state.selectedScenario = null;
                                    loadProjectBtn.disabled = true;
                                    loadProjectBtn.className = "w-full bg-gradient-to-r from-slate-700 to-slate-600 text-slate-400 cursor-not-allowed font-bold py-3 px-6 rounded-lg transition-all text-sm mt-4 flex items-center justify-center gap-2";
                                }
                                loadProjectsList();
                            } catch (err) {
                                alert("Failed to delete scenario: " + err.message);
                            }
                        }
                    });

                    const deleteProjBtn = scenCard.querySelector(".btn-delete-project");
                    deleteProjBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete the ENTIRE project containing "${project.economy} • ${project.sector_flow}"?\nThis will permanently delete all scenarios under this project.`)) {
                            try {
                                await deleteProject(project.id);
                                if (state.selectedProject && state.selectedProject.id === project.id) {
                                    state.selectedProject = null;
                                    state.selectedScenario = null;
                                    loadProjectBtn.disabled = true;
                                    loadProjectBtn.className = "w-full bg-gradient-to-r from-slate-700 to-slate-600 text-slate-400 cursor-not-allowed font-bold py-3 px-6 rounded-lg transition-all text-sm mt-4 flex items-center justify-center gap-2";
                                }
                                loadProjectsList();
                            } catch (err) {
                                alert("Failed to delete project: " + err.message);
                            }
                        }
                    });
                    
                    scenCard.addEventListener("click", () => {
                        Array.from(savedScenariosContainer.children).forEach(c => c.classList.remove("border-blue-500", "bg-blue-500/5"));
                        scenCard.classList.add("border-blue-500", "bg-blue-500/5");
                        
                        state.selectedProject = project;
                        state.selectedScenario = scen;
                        state.currentScenarioId = scen.id;
                        
                        loadProjectBtn.disabled = false;
                        loadProjectBtn.className = "w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-bold py-3 px-6 rounded-lg transition-all shadow-lg shadow-blue-500/20 text-sm mt-4 flex items-center justify-center gap-2 cursor-pointer";
                    });
                    
                    savedScenariosContainer.appendChild(scenCard);
                });
            }
        }).catch(err => console.error("Error loading nested details:", err));
    });
}

async function handleCreateScenario() {
    const name = newScenarioName.value.trim();
    const economy = newEconomy.value;
    const year = parseInt(newYear.value);
    const sector = newSector.value;

    if (!name) {
        alert("Please enter a name for the project.");
        return;
    }

    createProjectBtn.disabled = true;
    createProjectBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Instantiating environment...`;

    try {
        const economyClean = economy.replace("_", "");
        
        // Memory-first stateless scenario initialization
        const data = await fetchStatelessTemplate(economyClean, sector, year);
        
        const mockId = Date.now();
        state.selectedProject = {
            id: mockId,
            economy: economyClean,
            sector_flow: sector,
            is_mock: true
        };
        
        state.selectedScenario = {
            id: mockId,
            project_id: mockId,
            name: name,
            target_year: year,
            tree_state: { "base_year": data.tree_state },
            macro_drivers: { "base_year": data.macro_drivers },
            active_fuels: data.active_fuels
        };
        
        state.projectScenarios = [state.selectedScenario];
        state.activeYear = "base_year";
        state.treeState = state.selectedScenario.tree_state["base_year"];
        
        // Initialize Telemetry
        state.telemetry = { optimization_count: 0, auto_balance_count: 0 };
        
        state.activeView = "canvas";
        launchWorkspace();
    } catch (err) {
        alert("Failed to build project environment: " + err.message);
    } finally {
        createProjectBtn.disabled = false;
        createProjectBtn.innerHTML = `<i class="fa-solid fa-play"></i> Initialize Modeler Canvas`;
    }
}

async function handleLoadScenario() {
    if (!state.selectedScenario) return;
    
    loadProjectBtn.disabled = true;
    loadProjectBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Initializing workspace...`;
    
    try {
        const fullDetails = await fetchProjectDetails(state.selectedProject.id);
        state.projectScenarios = fullDetails.scenarios || [];
        
        const scen = fullDetails.scenarios.find(s => s.id === state.selectedScenario.id);
        
        // Multi-year fallback wrapper
        if (scen.tree_state && !scen.tree_state.base_year) {
             scen.tree_state = { "base_year": scen.tree_state };
             scen.macro_drivers = { "base_year": scen.macro_drivers || {} };
        }
        
        state.selectedScenario = scen;
        state.currentScenarioId = scen.id;
        state.activeYear = "base_year";
        state.treeState = scen.tree_state["base_year"] || { node_id: state.selectedProject.sector_flow, weight: 1.0, children: [], fuels: [] };
        
        state.activeView = "canvas";
        launchWorkspace();
    } catch (err) {
        alert("Error loading active project state: " + err.message);
    } finally {
        loadProjectBtn.disabled = false;
        loadProjectBtn.innerHTML = `<i class="fa-solid fa-folder-open"></i> Load Selected Scenario`;
    }
}

async function handleJSONImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validate properties
            const scenarioName = data.scenario_name || "Imported Scenario";
            const targetYear = data.target_year || 2022;
            const macroDrivers = data.macro_drivers || {};
            const treeState = data.tree_state || null;
            
            // Extract or dummy economy and sector
            let economy = "20USA";
            let sector = "16.02 Residential";
            
            // Try to extract from imported tree_state or name if possible
            if (treeState && treeState.node_id) {
                if (treeState.node_id.includes("Residential")) sector = "16.02 Residential";
                else if (treeState.node_id.includes("Commercial")) sector = "16.01 Commercial and public services";
                else if (treeState.node_id.includes("Industry")) sector = "14 Industry sector";
                else if (treeState.node_id.includes("Transport")) sector = "15 Transport sector";
                else sector = treeState.node_id;
            }

            if (confirm(`Do you want to import "${scenarioName}" (Year: ${targetYear}) into sector "${sector}"?`)) {
                // Step 1: Visual Load
                state.selectedProject = {
                    id: null,
                    economy: data.economy || economy,
                    sector_flow: data.sector_flow || sector,
                    is_mock: true
                };
                
                // Fallback for older JSON files that missed active_fuels
                let importedFuels = data.active_fuels;
                if (!importedFuels && data.telemetry && data.telemetry.esto_targets_vs_system) {
                    const tData = data.telemetry.esto_targets_vs_system;
                    const tList = Array.isArray(tData) ? tData : (tData["base_year"] || Object.values(tData)[0] || []);
                    importedFuels = tList.map(t => ({
                        fuel_id: t.fuel_id,
                        value: t.esto_target_pj
                    }));
                }
                           // Backwards Compatibility for Temporal Structure
                let parsedTree = treeState;
                let parsedMacro = macroDrivers;
                if (treeState && !treeState.base_year) {
                    parsedTree = { "base_year": treeState };
                    parsedMacro = { "base_year": macroDrivers };
                }

                state.selectedScenario = {
                    name: scenarioName,
                    target_year: targetYear,
                    tree_state: parsedTree,
                    macro_drivers: parsedMacro,
                    active_fuels: importedFuels || []
                };
                
                state.projectScenarios = [state.selectedScenario];
                state.activeYear = "base_year";
                state.treeState = parsedTree["base_year"];
                state.telemetry = data.telemetry || { optimization_count: 0, auto_balance_count: 0 };
                state.activeView = "canvas";
                
                launchWorkspace();
                
                // Clear file input
                event.target.value = "";
                
                // Step 2 & 3: Auth Check & Branching
                const token = localStorage.getItem('access_token');
                if (!token) {
                    state.currentScenarioId = null;
                    console.log("Loaded in memory mode. Login to save.");
                    return;
                }

                // Show loader overlay
                const importDefault = document.getElementById("import-default-state");
                const importLoading = document.getElementById("import-loading-state");
                if (importDefault && importLoading) {
                    importDefault.classList.add("opacity-0");
                    importLoading.classList.remove("opacity-0", "pointer-events-none");
                }
                
                try {
                    // Send to backend via POST /scenarios
                    const savedScen = await importScenario(data);
                    
                    const mockId = savedScen.project_id;
                    state.selectedProject.id = mockId;
                    state.selectedProject.is_mock = false;
                    
                    state.selectedScenario = savedScen;
                    state.currentScenarioId = savedScen.id;
                    state.projectScenarios = [state.selectedScenario];
                    
                    if (importDefault && importLoading) {
                        importLoading.classList.add("opacity-0", "pointer-events-none");
                        importDefault.classList.remove("opacity-0");
                    }
                    
                    console.log("Scenario imported successfully and saved to database!");
                } catch (err) {
                    if (importDefault && importLoading) {
                        importLoading.classList.add("opacity-0", "pointer-events-none");
                        importDefault.classList.remove("opacity-0");
                    }
                    alert("Failed to import scenario to database: " + err.message);
                }
            }
        } catch (err) {
            alert("Failed to parse or import scenario JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

function launchWorkspace() {
    badgeEconomy.innerText = state.selectedProject.economy;
    badgeSector.innerText = state.selectedProject.sector_flow;
    badgeYear.innerText = state.selectedScenario.target_year;
    
    // Move Auth UI to workspace header to prevent overlapping
    const authWrapper = document.getElementById("auth-header-wrapper");
    const workspaceActionBar = document.getElementById("workspace-action-bar");
    if (authWrapper && workspaceActionBar) {
        authWrapper.classList.remove("fixed", "top-4", "right-16", "z-[60]");
        workspaceActionBar.appendChild(authWrapper);
    }
    
    activeScenarioName.innerText = state.selectedScenario.name;
    activeScenarioDetails.innerText = `APEC ${state.selectedProject.economy} • ${state.selectedProject.sector_flow}`;

    // Fill Macro driver target total & input values
    const macro = state.selectedScenario.macro_drivers ? state.selectedScenario.macro_drivers[state.activeYear] : {};
    macroTargetTotal.value = macro.target_total || macro.total || 100.0;
    
    clearUnsaved();
    renderMacroDrivers();
    
    welcomeModal.classList.add("hidden");
    appWorkspace.classList.remove("hidden");
    
    switchViewMode(state.activeView);
}

function showWelcomeModal() {
    appWorkspace.classList.add("hidden");
    welcomeModal.classList.remove("hidden");
    loadProjectsList();
    
    // Restore Auth UI to absolute floating position for landing screens
    const authWrapper = document.getElementById("auth-header-wrapper");
    if (authWrapper) {
        authWrapper.classList.add("fixed", "top-4", "right-16", "z-[60]");
        document.body.appendChild(authWrapper);
    }
}


// ================= VIEW TOGGLE MODE (Canvas vs Comparison) =================

function switchViewMode(mode) {
    state.activeView = mode;
    
    if (mode === "canvas") {
        treeCanvasContainer.classList.remove("hidden");
        addMainBranchBtn.classList.remove("hidden");
        comparisonViewContainer.classList.add("hidden");
        resultsViewContainer.classList.add("hidden");
        
        centerPaneTitle.innerHTML = `<i class="fa-solid fa-network-wired text-blue-500"></i> Bottom-Up End-Use Canvas`;
        centerPaneSubtitle.innerText = "Freely construct branch nodes, adjust bounds, and append fuel allocations.";
        

        if (resultsSummaryBtn) {
            resultsSummaryBtn.className = "px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow shadow-slate-500/10";
        }
        
        renderScenarioTabs();
        renderWorkspaceCanvas();
        recalculateTreeEnergy();
    } else if (mode === "comparison") {
        treeCanvasContainer.classList.add("hidden");
        addMainBranchBtn.classList.add("hidden");
        comparisonViewContainer.classList.remove("hidden");
        resultsViewContainer.classList.add("hidden");
        
        centerPaneTitle.innerHTML = `<i class="fa-solid fa-code-compare text-teal-400"></i> Scenario Projections Comparison`;
        centerPaneSubtitle.innerText = "Side-by-side performance audit of Base Year vs Projection Scenarios.";
        

        if (resultsSummaryBtn) {
            resultsSummaryBtn.className = "px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow shadow-slate-500/10";
        }
        
        renderScenarioTabs();
        renderComparisonDashboard();
        recalculateTreeEnergy();
    } else if (mode === "results") {
        treeCanvasContainer.classList.add("hidden");
        addMainBranchBtn.classList.add("hidden");
        comparisonViewContainer.classList.add("hidden");
        resultsViewContainer.classList.remove("hidden");
        
        centerPaneTitle.innerHTML = `<i class="fa-solid fa-square-poll-vertical text-indigo-400"></i> Results Summary Dashboard`;
        centerPaneSubtitle.innerText = "Reconstructed bottom-up allocations with sector/fuel paths, absolute energy, and GDP intensities.";
        

        if (resultsSummaryBtn) {
            resultsSummaryBtn.className = "px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 border-none text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-500/15";
        }
        
        renderScenarioTabs();
        renderResultsSummaryDashboard();
        recalculateTreeEnergy();
    }
}

function switchViewToComparison() {
    if (state.activeView === "comparison") {
        switchViewMode("canvas");
    } else {
        switchViewMode("comparison");
    }
}


// ================= DYNAMIC SCENARIO TABS RENDERER =================

function renderScenarioTabs() {
    projectionsTabsContainer.innerHTML = "";
    if (!state.selectedScenario || !state.selectedScenario.tree_state) return;

    // Toggle Global / Projection buttons visually based on the current state.activeYear
    const isBaseGlobal = state.activeYear === "base_year";
    checkBalanceBtn.disabled = !isBaseGlobal;
    optimizeBtn.disabled = !isBaseGlobal;
    const projBtns = document.getElementById("projection-buttons-container");
    if (isBaseGlobal) {
        checkBalanceBtn.classList.remove("opacity-50", "cursor-not-allowed");
        optimizeBtn.classList.remove("opacity-50", "cursor-not-allowed");
        if (projBtns) projBtns.classList.add("hidden");
    } else {
        checkBalanceBtn.classList.add("opacity-50", "cursor-not-allowed");
        optimizeBtn.classList.add("opacity-50", "cursor-not-allowed");
        if (projBtns) projBtns.classList.remove("hidden");
    }
    
    const years = Object.keys(state.selectedScenario.tree_state).sort((a, b) => {
        if (a === "base_year") return -1;
        if (b === "base_year") return 1;
        return parseInt(a) - parseInt(b);
    });
    
    years.forEach(yearKey => {
        const btn = document.createElement("button");
        const isActive = yearKey === state.activeYear && state.activeView === "canvas";
        
        btn.className = isActive 
            ? "px-3.5 py-1.5 bg-slate-800 text-white font-medium rounded-md transition-all font-mono" 
            : "px-3.5 py-1.5 text-slate-400 hover:text-white font-medium rounded-md transition-all font-mono";
            
        const displayYear = yearKey === "base_year" ? state.selectedScenario.target_year : yearKey;
        btn.innerText = yearKey === "base_year" ? `${displayYear} (Base)` : displayYear;
        
        btn.addEventListener("click", () => {
            state.activeYear = yearKey;
            state.treeState = state.selectedScenario.tree_state[yearKey];
            
            badgeYear.innerText = displayYear;
            
            const subMacro = state.selectedScenario.macro_drivers[yearKey] || {};
            macroTargetTotal.value = subMacro.target_total || subMacro.total || 100.0;
            
            switchViewMode("canvas");
            renderMacroDrivers();
            recalculateTreeEnergy();
            renderScenarioTabs(); // Re-render to update active styling
        });
        
        projectionsTabsContainer.appendChild(btn);
    });
}

async function autoSaveCurrentState() {
    try {
        const targetVal = getActiveTargetTotal();
        if (!state.selectedScenario.macro_drivers) {
            state.selectedScenario.macro_drivers = {};
        }
        if (!state.selectedScenario.macro_drivers[state.activeYear]) {
            state.selectedScenario.macro_drivers[state.activeYear] = {};
        }
        state.selectedScenario.macro_drivers[state.activeYear].target_total = targetVal;
        state.selectedScenario.macro_drivers[state.activeYear].total = targetVal;
        
        // await updateScenario(state.selectedScenario.id, {
        //     tree_state: state.treeState,
        //     macro_drivers: state.selectedScenario.macro_drivers
        // });
        clearUnsaved();
    } catch (e) {
        console.warn("Auto save failed:", e);
    }
}


// ================= ADD PROJECTION SCENARIO FLOW =================

async function handleAddProjection() {
    if (!state.telemetry || state.telemetry.optimization_count < 1) {
        alert("You must run at least one successful optimization on the Base Year before projecting.");
        return;
    }

    const currentYears = Object.keys(state.selectedScenario.tree_state);
    if (currentYears.length >= 3) {
        alert("Maximum limit of 2 projections (3 total years including base) reached.");
        return;
    }

    const rawYear = prompt("Enter target year for the new projection (2027-2080):", "2035");
    if (rawYear === null) return;
    
    const year = parseInt(rawYear);
    if (isNaN(year) || year < 2027 || year > 2080) {
        alert("Invalid target year. Must be between 2027 and 2080.");
        return;
    }
    
    const yearStr = year.toString();
    if (currentYears.includes(yearStr)) {
        alert(`A projection for the year ${year} already exists.`);
        return;
    }
    
    const clonedTreeState = JSON.parse(JSON.stringify(state.selectedScenario.tree_state["base_year"]));
    const clonedMacro = JSON.parse(JSON.stringify(state.selectedScenario.macro_drivers["base_year"]));
    
    // Safely clone active fuels
    if (Array.isArray(state.selectedScenario.active_fuels)) {
        const baseFuels = state.selectedScenario.active_fuels;
        state.selectedScenario.active_fuels = { "base_year": baseFuels };
    }
    const clonedFuels = JSON.parse(JSON.stringify(state.selectedScenario.active_fuels["base_year"] || []));
    
    const cleanImbalances = (node) => {
        node.imbalance_flag = false;
        if (node.children) {
            node.children.forEach(cleanImbalances);
        }
    };
    cleanImbalances(clonedTreeState);
    
    state.selectedScenario.tree_state[yearStr] = clonedTreeState;
    state.selectedScenario.macro_drivers[yearStr] = clonedMacro;
    state.selectedScenario.active_fuels[yearStr] = clonedFuels;
    
    state.activeYear = yearStr;
    state.treeState = state.selectedScenario.tree_state[yearStr];
    
    badgeYear.innerText = yearStr;
    renderScenarioTabs();
    switchViewMode("canvas");
    optimizationMsgBox.classList.add("hidden");
    markUnsaved();
    alert(`Successfully cloned Base Year to new projection ${yearStr}!`);
}


// ================= BOTTOM-UP STRICTLY RECURSIVE HIERARCHY CANVAS RENDERER =================

function getNodeByPath(tree, path) {
    let current = tree;
    for (let index of path) {
        if (current && current.children && current.children[index] !== undefined) {
            current = current.children[index];
        } else {
            return null;
        }
    }
    return current;
}

function renderWorkspaceCanvas() {
    const treePanWrapper = document.getElementById("tree-pan-wrapper");
    if (!treePanWrapper) return;

    treePanWrapper.innerHTML = `
        <svg id="connections-canvas" class="absolute top-0 left-0 w-full h-full pointer-events-none" style="z-index: 0; overflow: visible;"></svg>
    `;
    if (!state.treeState) return;

    // Kick off recursion starting with the root node (wrapped in an array)
    buildTreeHTML([state.treeState], treePanWrapper, []);

    // Draw SVG lines after appending all nodes
    drawSVGLines();
}

/**
 * STRICTLY RECURSIVE tree-node builder mapping APEC active fuels and nested paths.
 * Generates nested tree-node-wrapper and tree-node-children structures to represent infinite depth connected graph.
 */
function buildTreeHTML(nodesArray, parentElement, currentPathArray = []) {
    nodesArray.forEach((node, index) => {
        const isRoot = (node === state.treeState);
        const path = isRoot ? [] : [...currentPathArray, index];
        const pathStr = path.join(',');

        // 1. Create a wrapper representing this branch
        const wrapper = document.createElement("div");
        wrapper.className = `tree-node-wrapper flex flex-col items-center relative ${isRoot ? 'is-root' : ''}`;

        // 2. Create modern card visual container
        const card = document.createElement("div");
        card.className = `glass border rounded-xl p-5 tree-node-card w-80 text-left ${node.imbalance_flag ? 'node-imbalanced' : 'border-slate-800/80'} z-10`;
        card.dataset.path = pathStr;

        const tx = node.ui_x || 0;
        const ty = node.ui_y || 0;
        card.style.transform = `translate(${tx}px, ${ty}px)`;
        card.dataset.dragX = tx;
        card.dataset.dragY = ty;

        // Node Header: Name & Delete & Energy Label
        const deleteButtonHtml = isRoot ? "" : `
            <button class="text-slate-500 hover:text-red-400 transition-all text-xs" data-action="delete" data-path="${pathStr}">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        const energyLabelHtml = `
            <span class="node-computed-energy text-teal-400 font-mono text-xs font-bold" data-calc-path="${pathStr}">0.00 PJ</span>
        `;

        const nameInputHtml = isRoot ? `
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-chevron-down accordion-chevron transition-transform text-slate-500 text-xs"></i>
                <div>
                    <h3 class="text-sm font-bold text-white uppercase">${node.node_id}</h3>
                    <span class="text-[10px] text-slate-400">Sector Base Hierarchy</span>
                </div>
            </div>
        ` : `
            <div class="flex items-center gap-2">
                <i class="fa-solid fa-chevron-down accordion-chevron transition-transform text-slate-500 text-xs"></i>
                <input type="text" value="${node.node_id}" class="w-full bg-transparent text-sm font-bold text-white border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none pb-0.5 rounded" placeholder="Node Name" data-action="rename" data-path="${pathStr}">
            </div>
        `;

        const headerHtml = `
            <div class="tree-card-header cursor-pointer select-none flex justify-between items-start gap-2 mb-1">
                <div class="flex-1">
                    ${nameInputHtml}
                </div>
                <div class="flex items-center gap-3">
                    ${energyLabelHtml}
                    ${deleteButtonHtml}
                </div>
            </div>
        `;

        // Generate dynamic macro driver options first
        const macroDrivers = state.selectedScenario.macro_drivers ? state.selectedScenario.macro_drivers[state.activeYear] : {};
        const macroOptionsHtml = Object.keys(macroDrivers)
            .filter(key => key !== "target_total" && key !== "total")
            .map(key => {
                let label = key;
                if (key === "households") label = "Households (Preset)";
                else if (key === "floor_area") label = "Floor Area (Preset)";
                else if (key === "occupancy") label = "Occupancy (Preset)";
                else if (key === "custom_index") label = "Custom Index (Preset)";
                else if (key === "gdp_ppp") label = "GDP PPP (Imported)";
                return `<option value="${key}" ${node.macro_driver_link === key ? 'selected' : ''}>${label}</option>`;
            })
            .join("");

        // Weights & constraints panel with Sliders
        const paramsHtml = isRoot ? `
            <div class="text-xs">
                <span class="text-slate-400 font-medium">Reconciliation Weight:</span>
                <span class="font-mono font-bold text-white px-2 py-0.5 bg-slate-950 rounded">1.0</span>
            </div>
        ` : `
            <div class="space-y-3.5">
                <div class="grid grid-cols-3 gap-2">
                    <div>
                        <label class="block text-[9px] text-slate-500 uppercase tracking-wide mb-0.5 font-medium">Weight</label>
                        <input type="number" step="0.01" value="${node.weight}" class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500" data-field="weight" data-path="${pathStr}">
                    </div>
                    <div>
                        <label class="block text-[9px] text-slate-500 uppercase tracking-wide mb-0.5 font-medium">Min W</label>
                        <input type="number" step="0.01" value="${node.min_weight !== null ? node.min_weight : ''}" placeholder="0" class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500" data-field="min_weight" data-path="${pathStr}">
                    </div>
                    <div>
                        <label class="block text-[9px] text-slate-500 uppercase tracking-wide mb-0.5 font-medium">Max W</label>
                        <input type="number" step="0.01" value="${node.max_weight !== null ? node.max_weight : ''}" placeholder="1" class="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500" data-field="max_weight" data-path="${pathStr}">
                    </div>
                </div>
                
                <div>
                    <input type="range" class="weight-slider w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500" min="0.0" max="1.0" step="0.01" value="${node.weight}" data-path="${pathStr}">
                </div>
                
                <div class="mt-3">
                    <label class="block text-[9px] text-slate-500 uppercase tracking-wide mb-1 font-semibold">Scale by Macro Driver</label>
                    <select class="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500 cursor-pointer" data-field="macro_driver_link" data-path="${pathStr}">
                        <option value="" ${!node.macro_driver_link ? 'selected' : ''}>None (Direct relative weight)</option>
                        ${macroOptionsHtml}
                    </select>
                </div>
            </div>
        `;

        // Enforce leaf-node dynamic constraints (mutual exclusivity between sub-branches and fuels)
        const hasChildren = (node.children && node.children.length > 0);
        const hasFuels = (node.fuels && node.fuels.length > 0);

        // Fuels allocations block
        let fuelsBlockHtml = "";
        if (!isRoot && !hasChildren) {
            const activeFuels = getActiveFuelsArray();
            let fuelsListHtml = "";
            
            if (node.fuels && node.fuels.length > 0) {
                node.fuels.forEach((fuel, fIndex) => {
                    const fuelPath = [...path, 'fuel', fIndex];
                    const fuelPathStr = fuelPath.join(',');
                    const fuelEnergyLabelHtml = `
                        <span class="fuel-computed-energy text-teal-400 font-mono text-[10px] font-bold" data-fuel-calc-path="${fuelPathStr}">0.00 PJ</span>
                    `;
                    
                    let optionsHtml = activeFuels.map(f => `
                        <option value="${f.fuel_id}" ${f.fuel_id === fuel.fuel_id ? 'selected' : ''}>
                            ${f.fuel_id}
                        </option>
                    `).join("");
                    
                    if (activeFuels.length === 0) {
                        optionsHtml = `
                            <option value="17 Electricity" ${fuel.fuel_id === "17 Electricity" ? 'selected':''}>Electricity</option>
                            <option value="03.01 Natural gas" ${fuel.fuel_id === "03.01 Natural gas" ? 'selected':''}>Natural Gas</option>
                            <option value="19 Biomass" ${fuel.fuel_id === "19 Biomass" ? 'selected':''}>Biomass</option>
                        `;
                    }

                    fuelsListHtml += `
                        <div class="bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 space-y-2">
                            <div class="flex justify-between items-center gap-2">
                                <select class="flex-1 bg-transparent text-[11px] font-bold text-slate-300 border-none focus:outline-none focus:ring-0 cursor-pointer" data-field="fuel_id" data-path="${fuelPathStr}">
                                    ${optionsHtml}
                                </select>
                                <div class="flex items-center gap-2">
                                    ${fuelEnergyLabelHtml}
                                    <button class="text-slate-600 hover:text-red-400 transition-all text-[10px]" data-action="delete-fuel" data-path="${fuelPathStr}">
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-1.5">
                                <div>
                                    <label class="block text-[8px] text-slate-500 uppercase tracking-wide mb-0.5">Share</label>
                                    <input type="number" step="0.01" value="${fuel.share}" class="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white font-mono focus:outline-none focus:border-blue-500" data-field="share" data-path="${fuelPathStr}">
                                </div>
                                <div>
                                    <label class="block text-[8px] text-slate-500 uppercase tracking-wide mb-0.5">Min W</label>
                                    <input type="number" step="0.01" value="${fuel.min_weight !== null ? fuel.min_weight : ''}" placeholder="0" class="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white font-mono focus:outline-none focus:border-blue-500" data-field="min_weight" data-path="${fuelPathStr}">
                                </div>
                                <div>
                                    <label class="block text-[8px] text-slate-500 uppercase tracking-wide mb-0.5">Max W</label>
                                    <input type="number" step="0.01" value="${fuel.max_weight !== null ? fuel.max_weight : ''}" placeholder="1" class="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white font-mono focus:outline-none focus:border-blue-500" data-field="max_weight" data-path="${fuelPathStr}">
                                </div>
                            </div>
                        </div>
                    `;
                });
            } else {
                fuelsListHtml = `
                    <div class="text-center py-2 text-[10px] text-slate-600 border border-dashed border-slate-800/80 rounded">
                        No fuels assigned
                    </div>
                `;
            }

            fuelsBlockHtml = `
                <div class="space-y-2 pt-2 border-t border-slate-800/80 mt-3">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Active Fuel Allocations</span>
                        <button class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-blue-400 rounded transition-all flex items-center gap-1 font-semibold" data-action="add-fuel" data-path="${pathStr}">
                            <i class="fa-solid fa-plus text-[8px]"></i> Fuel
                        </button>
                    </div>
                    <div class="space-y-1.5">${fuelsListHtml}</div>
                </div>
            `;
        }

        // Card footer options
        const footerHtml = hasFuels ? "" : `
            <div class="mt-3 pt-3 border-t border-slate-800/80 flex justify-between items-center text-xs">
                <button class="text-slate-400 hover:text-blue-400 font-semibold flex items-center gap-1 transition-all" data-action="add-child" data-path="${pathStr}">
                    <i class="fa-solid fa-code-branch text-[10px]"></i> Add Sub-Branch
                </button>
            </div>
        `;

        card.innerHTML = `
            ${headerHtml}
            <div class="tree-card-body mt-3 space-y-3">
                ${paramsHtml}
                ${fuelsBlockHtml}
                ${footerHtml}
            </div>
        `;

        wrapper.appendChild(card);
        parentElement.appendChild(wrapper);

        // 3. RECURSIVELY call buildTreeHTML to render nested children (infinite layering)
        if (node.children && node.children.length > 0) {
            const childDiv = document.createElement("div");
            childDiv.className = "tree-node-children flex justify-center relative";
            wrapper.appendChild(childDiv);
            
            buildTreeHTML(node.children, childDiv, path);
        }
    });
}

// ================= EVENT DELEGATION ON CANVAS =================

// 1. Click delegation
treeCanvasContainer.addEventListener("click", (e) => {
    // Accordion toggle on tree-card-header click
    const headerClick = e.target.closest(".tree-card-header");
    if (headerClick && !e.target.closest("input, select, button")) {
        const card = headerClick.closest(".tree-node-card");
        if (card) {
            card.classList.toggle("show-body");
        }
        return;
    }

    const target = e.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;
    const pathStr = target.dataset.path;
    if (pathStr === undefined) return;

    const pathArr = pathStr === "" ? [] : pathStr.split(",");

    if (action === "add-child") {
        const targetNodePath = pathArr.map(Number);
        const targetNode = getNodeByPath(state.treeState, targetNodePath);
        if (targetNode) {
            if (!targetNode.children) targetNode.children = [];
            targetNode.children.push({
                node_id: "New Sub-Branch",
                weight: 0.1,
                min_weight: 0.0,
                max_weight: 1.0,
                imbalance_flag: false,
                children: [],
                fuels: []
            });
            renderWorkspaceCanvas();
            recalculateTreeEnergy();
        }
    } else if (action === "delete") {
        if (confirm("Are you sure you want to remove this end-use branch node?")) {
            const targetNodePath = pathArr.map(Number);
            if (targetNodePath.length === 1) {
                state.treeState.children.splice(targetNodePath[0], 1);
            } else if (targetNodePath.length > 1) {
                const parentPath = targetNodePath.slice(0, -1);
                const idx = targetNodePath[targetNodePath.length - 1];
                const parentNode = getNodeByPath(state.treeState, parentPath);
                if (parentNode && parentNode.children) {
                    parentNode.children.splice(idx, 1);
                }
            }
            renderWorkspaceCanvas();
            recalculateTreeEnergy();
        }
    } else if (action === "add-fuel") {
        const targetNodePath = pathArr.map(Number);
        const targetNode = getNodeByPath(state.treeState, targetNodePath);
        if (targetNode) {
            if (!targetNode.fuels) targetNode.fuels = [];
            const activeFuels = getActiveFuelsArray();
            const defaultFuelId = activeFuels.length > 0 ? activeFuels[0].fuel_id : "17 Electricity";
            
            targetNode.fuels.push({
                fuel_id: defaultFuelId,
                share: 0.5,
                min_weight: 0.0,
                max_weight: 1.0
            });
            renderWorkspaceCanvas();
            recalculateTreeEnergy();
        }
    } else if (action === "delete-fuel") {
        const fIndex = parseInt(pathArr[pathArr.length - 1]);
        const parentNodePath = pathArr.slice(0, -2).map(Number);
        const parentNode = getNodeByPath(state.treeState, parentNodePath);
        if (parentNode && parentNode.fuels) {
            parentNode.fuels.splice(fIndex, 1);
            renderWorkspaceCanvas();
            recalculateTreeEnergy();
        }
    }
});

// 2. Change delegation
treeCanvasContainer.addEventListener("change", (e) => {
    const target = e.target;
    const pathStr = target.dataset.path;
    const field = target.dataset.field;
    const action = target.dataset.action;
    
    if (pathStr === undefined) return;
    const pathArr = pathStr === "" ? [] : pathStr.split(",");

    if (pathArr.includes("fuel")) {
        // Fuel element updates
        const fIndex = parseInt(pathArr[pathArr.length - 1]);
        const parentNodePath = pathArr.slice(0, -2).map(Number);
        const parentNode = getNodeByPath(state.treeState, parentNodePath);
        
        if (parentNode && parentNode.fuels && parentNode.fuels[fIndex]) {
            const targetFuel = parentNode.fuels[fIndex];
            const val = target.value;
            if (field === "fuel_id") {
                targetFuel.fuel_id = val;
            } else {
                if (val === "") {
                    targetFuel[field] = null;
                } else {
                    targetFuel[field] = parseFloat(val);
                }
            }
        }
    } else {
        // Node element updates
        const targetNodePath = pathArr.map(Number);
        const targetNode = getNodeByPath(state.treeState, targetNodePath);
        
        if (targetNode) {
            const val = target.value;
            if (action === "rename") {
                targetNode.node_id = val;
            } else if (field === "macro_driver_link") {
                targetNode.macro_driver_link = val || null;
            } else {
                if (val === "") {
                    targetNode[field] = null;
                } else {
                    targetNode[field] = parseFloat(val);
                    // Update matching slider range value if numeric weight changed
                    if (field === "weight") {
                        const slider = treeCanvasContainer.querySelector(`.weight-slider[data-path="${pathStr}"]`);
                        if (slider) slider.value = val;
                    }
                }
            }
        }
    }
    recalculateTreeEnergy();
});

// 3. Input delegation (for real-time slider to numeric input sync)
treeCanvasContainer.addEventListener("input", (e) => {
    const target = e.target;
    if (!target.classList.contains("weight-slider")) return;

    const pathStr = target.dataset.path;
    if (pathStr === undefined) return;
    
    const pathArr = pathStr === "" ? [] : pathStr.split(",");
    const targetNodePath = pathArr.map(Number);
    const targetNode = getNodeByPath(state.treeState, targetNodePath);
    
    if (targetNode) {
        const val = parseFloat(target.value) || 0.0;
        targetNode.weight = val;
        
        // Update numeric weight input value
        const numInput = treeCanvasContainer.querySelector(`input[data-field="weight"][data-path="${pathStr}"]`);
        if (numInput) {
            numInput.value = target.value;
        }
        
        markUnsaved();
        recalculateTreeEnergy();
    }
});

// Add main top-level child branch
addMainBranchBtn.addEventListener("click", () => {
    if (!state.treeState.children) state.treeState.children = [];
    state.treeState.children.push({
        node_id: "New End-Use Node",
        weight: 0.2,
        min_weight: 0.0,
        max_weight: 1.0,
        imbalance_flag: false,
        children: [],
        fuels: []
    });
    renderWorkspaceCanvas();
    recalculateTreeEnergy();
});


// ================= ACTIONS & BUTTONS EVENT HANDLERS =================

async function attemptSaveToDatabase() {
    downloadJsonBtn.disabled = true;
    downloadJsonBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Saving to Database...`;
    
    try {
        const targetVal = getActiveTargetTotal();
        if (!state.selectedScenario.macro_drivers) {
            state.selectedScenario.macro_drivers = {};
        }
        if (!state.selectedScenario.macro_drivers[state.activeYear]) {
            state.selectedScenario.macro_drivers[state.activeYear] = {};
        }
        state.selectedScenario.macro_drivers[state.activeYear].target_total = targetVal;
        state.selectedScenario.macro_drivers[state.activeYear].total = targetVal;
        
        let finalScen;
        if (!state.currentScenarioId || state.selectedProject.is_mock) {
            // First-time DB persistence
            const newProject = await createProject(state.selectedProject.economy, state.selectedProject.sector_flow, state.selectedScenario.target_year);
            const baseScenarioId = newProject.scenarios[0].id;
            finalScen = await updateScenario(baseScenarioId, {
                name: activeScenarioName.innerText,
                tree_state: state.treeState,
                macro_drivers: state.selectedScenario.macro_drivers
            });
            state.selectedProject = newProject;
            state.selectedProject.is_mock = false;
            state.currentScenarioId = finalScen.id;
        } else {
            // Standard update for an existing scenario (PUT)
            finalScen = await updateScenario(state.currentScenarioId, {
                name: activeScenarioName.innerText,
                tree_state: state.treeState,
                macro_drivers: state.selectedScenario.macro_drivers
            });
        }
        
        state.selectedScenario = finalScen;
        
        const idx = state.projectScenarios.findIndex(s => s.id === finalScen.id);
        if (idx !== -1) {
            state.projectScenarios[idx] = finalScen;
        } else {
            state.projectScenarios = [finalScen];
        }
        
        renderScenarioTabs();
        alert("Scenario layout saved successfully to database!");
        pendingSaveAction = null;
    } catch (err) {
        if (err.message === "401_UNAUTHORIZED") {
            localStorage.removeItem('access_token');
            updateAuthUI();
            pendingSaveAction = attemptSaveToDatabase;
            showAuthModal();
            if (authErrorMsg) {
                authErrorMsg.innerText = "Session expired. Please log in to save your progress.";
                authErrorMsg.classList.remove("hidden");
            }
            return;
        }
        alert("Failed to save model: " + err.message);
    } finally {
        downloadJsonBtn.disabled = false;
        downloadJsonBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Admin: Save to Database`;
    }
}

downloadJsonBtn.addEventListener("click", async () => {
    if (!localStorage.getItem('access_token')) {
        pendingSaveAction = attemptSaveToDatabase;
        showAuthModal();
        return;
    }
    await attemptSaveToDatabase();
});

checkBalanceBtn.addEventListener("click", () => {
    if (!state.treeState || !state.selectedScenario) return;

    if (!state.treeState || !state.selectedScenario) return;

    // 2. Calculate current bottom-up contributions
    const activeMacroDrivers = state.selectedScenario.macro_drivers ? state.selectedScenario.macro_drivers[state.activeYear] : {};
    const targetVal = getActiveTargetTotal();
    const contributions = {};
    calculateNodeContribution(state.treeState, activeMacroDrivers, targetVal, [], contributions);

    // 3. Strict individual fuel validation
    const activeFuels = getActiveFuelsArray();
    let isValid = true;
    let errorMsg = "Mass imbalances detected against ESTO targets:\n\n";

    activeFuels.forEach(fuel => {
        const targetEnergy = parseFloat(fuel.value) || 0.0;
        const calculatedEnergy = contributions[fuel.fuel_id] || 0.0;
        const diff = calculatedEnergy - targetEnergy;
        
        // Strict 0.1 PJ tolerance per fuel
        if (Math.abs(diff) > 0.1) {
            isValid = false;
            errorMsg += `• ${fuel.fuel_id.split(" ")[1] || fuel.fuel_id}: Target = ${targetEnergy.toFixed(1)}, Calc = ${calculatedEnergy.toFixed(1)}, Diff = ${Math.abs(diff).toFixed(1)} PJ\n`;
        }
    });

    // 4. Resolve or prompt for Balancing Node
    if (isValid) {
        alert("Perfectly Balanced! All individual fuels match ESTO targets.");
        return;
    }

    // 4. Check if balancing node already exists
    const hasBalancingNode = state.treeState.children && state.treeState.children.some(c => c.node_id === "Balancing Node");

    if (hasBalancingNode) {
        alert(errorMsg + "\n\nA Balancing Node already exists in this scenario. Please click 'Run SLSQP Optimization' to re-balance the weights.");
        return;
    }

    errorMsg += "\nDo you want to generate a 'Balancing Node' to absorb the missing fuels and energy?";
    const wantsBalancing = confirm(errorMsg);
    
    if (wantsBalancing) {
        // 5. Literal v9 Balancing Node Injection adapted to v10 structure
        const fuelShare = activeFuels.length > 0 ? (1.0 / activeFuels.length) : 1.0;
        
        const fuelsList = activeFuels.map(f => ({
            fuel_id: f.fuel_id,
            share: parseFloat(fuelShare.toFixed(4)),
            min_weight: 0.0,
            max_weight: 1.0
        }));

        if (!state.treeState.children) state.treeState.children = [];
        
        // Inject the sink node
        state.treeState.children.push({
            node_id: "Balancing Node",
            weight: 0.1, // Small initial weight to allow optimizer scaling
            min_weight: 0.0,
            max_weight: 1.0,
            imbalance_flag: true,
            fuels: [],
            children: [
                {
                    node_id: "Unspecified Uses",
                    weight: 1.0,
                    min_weight: 0.0,
                    max_weight: 1.0,
                    imbalance_flag: false,
                    children: [],
                    fuels: fuelsList
                }
            ]
        });

        markUnsaved();
        renderWorkspaceCanvas();
        recalculateTreeEnergy();
        
        if (!state.telemetry) state.telemetry = { optimization_count: 0, auto_balance_count: 0 };
        state.telemetry.auto_balance_count += 1;
        
        alert("Balancing node injected! It contains all active fuels. Click 'Run SLSQP Optimization' to calculate the exact missing weights.");
    }
});

optimizeBtn.addEventListener("click", async () => {
    optimizeBtn.disabled = true;
    optimizeBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Solving SLSQP...`;
    
    try {
        const targetVal = getActiveTargetTotal();
        if (!state.selectedScenario.macro_drivers) {
            state.selectedScenario.macro_drivers = {};
        }
        if (!state.selectedScenario.macro_drivers[state.activeYear]) {
            state.selectedScenario.macro_drivers[state.activeYear] = {};
        }
        state.selectedScenario.macro_drivers[state.activeYear].target_total = targetVal;
        state.selectedScenario.macro_drivers[state.activeYear].total = targetVal;

        // Recursive helper function to normalize weights and shares to make the initial guess feasible
        const normalizeTreeWeights = (node) => {
            if (node.children && node.children.length > 0) {
                const childSum = node.children.reduce((sum, child) => sum + parseFloat(child.weight || 0), 0.0);
                if (childSum > 0) {
                    node.children.forEach(child => {
                        child.weight = parseFloat((parseFloat(child.weight || 0) / childSum).toFixed(4));
                    });
                }
                node.children.forEach(normalizeTreeWeights);
            }
            if (node.fuels && node.fuels.length > 0) {
                const fuelSum = node.fuels.reduce((sum, fuel) => sum + parseFloat(fuel.share || 0), 0.0);
                if (fuelSum > 0) {
                    node.fuels.forEach(fuel => {
                        fuel.share = parseFloat((parseFloat(fuel.share || 0) / fuelSum).toFixed(4));
                    });
                }
            }
        };

        // Normalize weights of the tree state in-place
        normalizeTreeWeights(state.treeState);

        // Immediately update the canvas to show clean normalized weights
        renderWorkspaceCanvas();
        recalculateTreeEnergy();
        
        // Memory-first stateless optimization
        const activeFuels = getActiveFuelsArray();
        const result = await optimizeStatelessTree(
            state.treeState,
            targetVal,
            state.selectedScenario.macro_drivers[state.activeYear],
            activeFuels
        );
        
        state.treeState = result.tree_state;
        state.selectedScenario.tree_state[state.activeYear] = result.tree_state;
        
        if (!state.telemetry) state.telemetry = { optimization_count: 0, auto_balance_count: 0 };
        state.telemetry.optimization_count += 1;
        
        clearUnsaved();
        
        if (state.activeView === "comparison") {
            renderComparisonDashboard();
        } else {
            renderWorkspaceCanvas();
        }
        recalculateTreeEnergy();
        
        optimizationMsgBox.classList.remove("hidden");
        if (result.tree_state.optimization_success) {
            optimizationMsgBox.className = "mt-6 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-[11px] text-emerald-400";
            optimizationMsgBox.innerHTML = `
                <div class="font-bold flex items-center gap-1 mb-1">
                    <i class="fa-solid fa-circle-check"></i> Solver Converged
                </div>
                <div>${result.tree_state.optimization_message || "Reconciliation successful."}</div>
            `;
        } else {
            optimizationMsgBox.className = "mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-[11px] text-red-400";
            optimizationMsgBox.innerHTML = `
                <div class="font-bold flex items-center gap-1 mb-1">
                    <i class="fa-solid fa-circle-exclamation"></i> Solver Diverged
                </div>
                <div>${result.tree_state.optimization_message || "Bounds or constraint limits violated."}</div>
            `;
        }
    } catch (err) {
        alert("Optimization process failed: " + err.message);
    } finally {
        optimizeBtn.disabled = false;
        optimizeBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> Run SLSQP Optimization`;
    }
});


exportLeapBtn.addEventListener("click", () => {
    try {
        exportLEAP(state.selectedProject.id, "excel");
    } catch (err) {
        alert("LEAP export compilation failed: " + err.message);
    }
});

// ================= PROJECTED BUTTONS & MACRO EVENTS =================
document.getElementById("proj-check-balance-btn")?.addEventListener("click", () => {
    const wasDisabled = checkBalanceBtn.disabled;
    checkBalanceBtn.disabled = false;
    checkBalanceBtn.click(); // Logically isolated via state.activeYear
    if (wasDisabled) checkBalanceBtn.disabled = true;
});

document.getElementById("proj-optimize-btn")?.addEventListener("click", () => {
    const wasDisabled = optimizeBtn.disabled;
    optimizeBtn.disabled = false;
    optimizeBtn.click(); // Logically isolated via state.activeYear
    if (wasDisabled) optimizeBtn.disabled = true;
});

const macroPctInp = document.getElementById("macro-pct-input");
const macroPjInp = document.getElementById("macro-pj-input");
if (macroPctInp && macroPjInp) {
    const handleMacroInput = (e) => {
        if (!state.selectedScenario || state.activeYear === "base_year") return;
        const target = e.target;
        const isPct = target.id === "macro-pct-input";
        let val = parseFloat(target.value);
        if (isNaN(val)) val = 0;
        
        const baseMacro = state.selectedScenario.macro_drivers["base_year"] || {};
        const baseVal = parseFloat(baseMacro.target_total) || 100.0;
        
        if (!state.selectedScenario.macro_drivers[state.activeYear]) {
            state.selectedScenario.macro_drivers[state.activeYear] = {};
        }
        
        if (isPct) {
            const newPj = baseVal * (1 + (val / 100));
            macroPjInp.value = newPj.toFixed(2);
            state.selectedScenario.macro_drivers[state.activeYear].target_total = newPj;
            state.selectedScenario.macro_drivers[state.activeYear].total = newPj;
        } else {
            const newPct = baseVal > 0 ? ((val / baseVal) - 1) * 100 : 0;
            macroPctInp.value = newPct.toFixed(2);
            state.selectedScenario.macro_drivers[state.activeYear].target_total = val;
            state.selectedScenario.macro_drivers[state.activeYear].total = val;
        }
        markUnsaved();
    };
    macroPctInp.addEventListener("input", handleMacroInput);
    macroPjInp.addEventListener("input", handleMacroInput);
}

// ================= CALCULATIONS & TARGET PROGRESS BARS =================

/**
 * Recursive bottom-up tree traversal to aggregate calculated fuel demands.
 * Strictly calculates cascading energy top-down.
 */
function calculateNodeContribution(node, activeMacroDrivers, incomingEnergy, currentPath = [], contributions = {}) {
    const targetVal = getActiveTargetTotal();
    
    // The incomingEnergy parameter is the energy assigned to this node
    let currentEnergy = incomingEnergy;
    
    const pathStr = currentPath.join(",");
    
    // Update node computed energy visual label in the DOM
    const nodeLabel = treeCanvasContainer.querySelector(`.node-computed-energy[data-calc-path="${pathStr}"]`);
    if (nodeLabel) {
        const pctOfTotal = targetVal > 0 ? ((currentEnergy / targetVal) * 100).toFixed(1) : "0.0";
        nodeLabel.innerHTML = `${currentEnergy.toFixed(2)} PJ <span class="text-[9px] text-slate-500 font-semibold">(${pctOfTotal}%)</span>`;
    }
    
    // Process fuels
    if (node.fuels && node.fuels.length > 0) {
        const totalFuelShare = node.fuels.reduce((sum, fuel) => sum + parseFloat(fuel.share || 0), 0.0);
        
        node.fuels.forEach((fuel, fIndex) => {
            const normalizedShare = totalFuelShare > 0 ? (parseFloat(fuel.share || 0) / totalFuelShare) : 0.0;
            const fuelEnergy = currentEnergy * normalizedShare;
            
            // Add fuel energy to global contributions map
            contributions[fuel.fuel_id] = (contributions[fuel.fuel_id] || 0) + fuelEnergy;
            
            // Update fuel computed energy visual label in the DOM
            const fuelPathStr = currentPath.concat('fuel', fIndex).join(",");
            const fuelLabel = treeCanvasContainer.querySelector(`.fuel-computed-energy[data-fuel-calc-path="${fuelPathStr}"]`);
            if (fuelLabel) {
                const fuelPct = targetVal > 0 ? ((fuelEnergy / targetVal) * 100).toFixed(1) : "0.0";
                fuelLabel.innerHTML = `${fuelEnergy.toFixed(2)} PJ <span class="text-[8px] text-slate-500 font-semibold">(${fuelPct}%)</span>`;
            }
        });
    }
    
    // Recurse children
    if (node.children && node.children.length > 0) {
        // Loop 1: Calculate apparent weight for each child (purely relative)
        const apparentWeights = node.children.map(child => {
            return parseFloat(child.weight || 0);
        });
        
        const totalApparent = apparentWeights.reduce((sum, w) => sum + w, 0.0);
        
        // Loop 2: Calculate childEnergy and recurse
        node.children.forEach((child, index) => {
            const apparentWeight = apparentWeights[index];
            const normWeight = totalApparent > 0 ? (apparentWeight / totalApparent) : 0.0;
            const childEnergy = currentEnergy * normWeight;
            
            calculateNodeContribution(
                child, 
                activeMacroDrivers, 
                childEnergy, 
                currentPath.concat(index), 
                contributions
            );
        });
    }
    
    return contributions;
}

/**
 * Recalculates bottom-up energy figures in real-time, updating progress bars and dashboard stats.
 */
function recalculateTreeEnergy() {
    if (!state.treeState || !state.selectedScenario) return;

    // Get active macro drivers directly from the state scenario
    const activeMacroDrivers = state.selectedScenario.macro_drivers ? state.selectedScenario.macro_drivers[state.activeYear] : {};
    const targetVal = getActiveTargetTotal();

    // Calculate aggregated bottom-up values by fuel type flowing top-down starting with targetVal
    const contributions = {};
    calculateNodeContribution(state.treeState, activeMacroDrivers, targetVal, [], contributions);

    // Sum total bottom-up energy (from leaf fuel contributions)
    let bottomUpVal = 0.0;
    for (let fid in contributions) {
        bottomUpVal += contributions[fid];
    }

    // Update Projections Stats
    const dev = Math.abs(bottomUpVal - targetVal);

    statBottomUp.innerHTML = `${bottomUpVal.toFixed(2)} <span class="text-xs font-semibold text-slate-500">PJ</span>`;
    statTopDown.innerHTML = `${targetVal.toFixed(2)} <span class="text-xs font-semibold text-slate-500">PJ</span>`;
    statImbalance.innerHTML = `${dev.toFixed(2)} <span class="text-xs font-semibold text-slate-500">PJ</span>`;

    if (dev <= 0.01 * targetVal) {
        statImbalance.className = "text-2xl font-black text-emerald-400 font-mono";
    } else {
        statImbalance.className = "text-2xl font-black text-red-400 font-mono";
    }

    // Render or Update Fuel Target Progress Bars and Dual Inputs
    let activeFuels = state.selectedScenario.active_fuels;
    if (Array.isArray(activeFuels)) {
        activeFuels = { "base_year": activeFuels };
        state.selectedScenario.active_fuels = activeFuels;
    }
    const currentFuels = activeFuels ? (activeFuels[state.activeYear] || activeFuels["base_year"] || []) : [];
    const baseFuels = activeFuels ? (activeFuels["base_year"] || []) : [];
    const isProjected = state.activeYear !== "base_year";

    if (currentFuels.length === 0) {
        fuelTargetsContainer.innerHTML = `
            <div class="text-center py-4 text-[10px] text-slate-600 border border-dashed border-slate-800/80 rounded">
                No active fuels loaded from APEC
            </div>
        `;
    } else {
        // Only clear if the number of fuels changed or if we switched years (determined by a custom attribute on the container)
        if (fuelTargetsContainer.getAttribute("data-rendered-year") !== state.activeYear) {
            fuelTargetsContainer.innerHTML = "";
            fuelTargetsContainer.setAttribute("data-rendered-year", state.activeYear);
        }

        currentFuels.forEach((fuel, idx) => {
            const targetEnergy = parseFloat(fuel.value) || 0.0;
            const calculatedEnergy = contributions[fuel.fuel_id] || 0.0;
            
            let pct = 0;
            if (targetEnergy > 0) {
                pct = Math.min((calculatedEnergy / targetEnergy) * 100, 100);
            }
            
            let barColor = "bg-blue-500";
            let trackingStatus = "text-blue-400";
            const devPct = Math.abs(calculatedEnergy - targetEnergy) / (targetEnergy || 1.0);
            
            if (devPct <= 0.02) {
                barColor = "bg-emerald-500";
                trackingStatus = "text-emerald-400 font-semibold";
            } else if (devPct > 0.15) {
                barColor = "bg-red-500 animate-pulse";
                trackingStatus = "text-red-400 font-semibold";
            } else {
                barColor = "bg-amber-500";
                trackingStatus = "text-amber-400";
            }

            const safeId = fuel.fuel_id.replace(/[^a-zA-Z0-9]/g, '-');
            let barCard = document.getElementById(`fuel-card-${safeId}`);
            
            if (!barCard) {
                barCard = document.createElement("div");
                barCard.id = `fuel-card-${safeId}`;
                barCard.className = "space-y-1 p-2 rounded bg-slate-950/40 border border-slate-800/50";
                
                let dualInputHtml = "";
                if (isProjected) {
                    const baseF = baseFuels.find(f => f.fuel_id === fuel.fuel_id);
                    const baseVal = baseF ? parseFloat(baseF.value) || 0 : 0;
                    const deltaPct = baseVal > 0 ? ((targetEnergy / baseVal) - 1) * 100 : 0;
                    
                    dualInputHtml = `
                        <div class="mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-2">
                            <div class="flex-1 relative">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 font-bold uppercase">Δ%</span>
                                <input type="number" step="0.1" data-fuel-idx="${idx}" data-field="pct" data-base="${baseVal}" value="${deltaPct.toFixed(2)}" class="fuel-dual-input w-full bg-slate-900 border border-slate-700 rounded text-[10px] text-white py-1 pl-7 pr-2 focus:border-indigo-500 outline-none text-right font-mono">
                            </div>
                            <div class="flex-1 relative">
                                <span class="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 font-bold uppercase">ΔPJ</span>
                                <input type="number" step="0.1" data-fuel-idx="${idx}" data-field="pj" data-base="${baseVal}" value="${targetEnergy.toFixed(2)}" class="fuel-dual-input w-full bg-slate-900 border border-slate-700 rounded text-[10px] text-white py-1 pl-8 pr-2 focus:border-indigo-500 outline-none text-right font-mono">
                            </div>
                        </div>
                    `;
                }

                barCard.innerHTML = `
                    <div class="flex justify-between items-center text-xs">
                        <span class="font-bold text-slate-300 truncate max-w-[160px]">${fuel.fuel_id.includes(' ') ? fuel.fuel_id.split(' ').slice(1).join(' ') : fuel.fuel_id}</span>
                        <span id="fuel-text-${safeId}" class="${trackingStatus} font-mono">${calculatedEnergy.toFixed(1)} / ${targetEnergy.toFixed(1)} <span class="text-[9px] text-slate-500 font-semibold">PJ</span></span>
                    </div>
                    <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800/60 mt-1">
                        <div id="fuel-bar-${safeId}" class="${barColor} h-full rounded-full transition-all duration-300" style="width: ${pct}%"></div>
                    </div>
                    ${dualInputHtml}
                `;
                fuelTargetsContainer.appendChild(barCard);

                // Attach bidirectional math listeners
                if (isProjected) {
                    const inputs = barCard.querySelectorAll('.fuel-dual-input');
                    inputs.forEach(inp => {
                        inp.addEventListener('input', (e) => {
                            const target = e.target;
                            const idx = target.dataset.fuelIdx;
                            const field = target.dataset.field;
                            const baseVal = parseFloat(target.dataset.base);
                            let val = parseFloat(target.value);
                            if (isNaN(val)) val = 0;
                            
                            const sibling = barCard.querySelector(`.fuel-dual-input[data-field="${field === 'pct' ? 'pj' : 'pct'}"]`);
                            
                            // Safeguard migration for legacy state shapes
                            if (Array.isArray(state.selectedScenario.active_fuels)) {
                                const baseFuels = state.selectedScenario.active_fuels;
                                state.selectedScenario.active_fuels = { "base_year": baseFuels };
                            }
                            if (!state.selectedScenario.active_fuels[state.activeYear]) {
                                state.selectedScenario.active_fuels[state.activeYear] = JSON.parse(JSON.stringify(state.selectedScenario.active_fuels["base_year"]));
                            }

                            let newTargetVal = val;
                            if (field === 'pct') {
                                const newPj = baseVal * (1 + (val / 100));
                                if (sibling) sibling.value = newPj.toFixed(2);
                                state.selectedScenario.active_fuels[state.activeYear][idx].value = newPj;
                                newTargetVal = newPj;
                            } else {
                                const newPct = baseVal > 0 ? ((val / baseVal) - 1) * 100 : 0;
                                if (sibling) sibling.value = newPct.toFixed(2);
                                state.selectedScenario.active_fuels[state.activeYear][idx].value = val;
                            }
                            markUnsaved();
                            
                            // Auto-Update Macro Target Sum dynamically
                            const totalFuelsSum = state.selectedScenario.active_fuels[state.activeYear].reduce((sum, f) => sum + (parseFloat(f.value) || 0), 0);
                            if (!state.selectedScenario.macro_drivers) state.selectedScenario.macro_drivers = {};
                            if (!state.selectedScenario.macro_drivers[state.activeYear]) state.selectedScenario.macro_drivers[state.activeYear] = {};
                            state.selectedScenario.macro_drivers[state.activeYear].target_total = totalFuelsSum;
                            state.selectedScenario.macro_drivers[state.activeYear].total = totalFuelsSum;
                            
                            const statTopDown = document.getElementById("stat-top-down");
                            if (statTopDown) {
                                statTopDown.innerHTML = `${totalFuelsSum.toFixed(2)} <span class="text-xs font-semibold text-slate-500">PJ</span>`;
                            }
                            const macroPjInp = document.getElementById("macro-pj-input");
                            if (macroPjInp) macroPjInp.value = totalFuelsSum.toFixed(2);
                            
                            const statBottomUp = document.getElementById("stat-bottom-up");
                            const statImbalance = document.getElementById("stat-imbalance");
                            if (statBottomUp && statImbalance) {
                                const currentBottomUp = parseFloat(statBottomUp.innerText) || 0;
                                const dev = Math.abs(currentBottomUp - totalFuelsSum);
                                statImbalance.innerHTML = `${dev.toFixed(2)} <span class="text-xs font-semibold text-slate-500">PJ</span>`;
                                if (dev <= 0.01 * totalFuelsSum) {
                                    statImbalance.className = "text-2xl font-black text-emerald-400 font-mono";
                                } else {
                                    statImbalance.className = "text-2xl font-black text-red-400 font-mono";
                                }
                            }

                            // Dynamically update the span text and animated bar width
                            const fuelObj = state.selectedScenario.active_fuels[state.activeYear][idx];
                            const safeFuelId = fuelObj.fuel_id.replace(/[^a-zA-Z0-9]/g, '-');
                            const targetSpan = document.getElementById(`fuel-text-${safeFuelId}`);
                            const barDiv = document.getElementById(`fuel-bar-${safeFuelId}`);
                            
                            if (targetSpan && barDiv) {
                                const currentText = targetSpan.innerText;
                                const calcPart = currentText.split('/')[0].trim();
                                const currentCalculatedEnergy = parseFloat(calcPart) || 0;
                                
                                const activeMacroTotal = getActiveTargetTotal();
                                const diff = currentCalculatedEnergy - newTargetVal;
                                
                                let trackingStatus = "text-red-400";
                                let barColor = "bg-red-500";
                                if (Math.abs(diff) <= 0.01 * activeMacroTotal) {
                                    trackingStatus = "text-emerald-400";
                                    barColor = "bg-emerald-500";
                                }
                                
                                const pct = newTargetVal > 0 ? Math.min((currentCalculatedEnergy / newTargetVal) * 100, 100) : 0;
                                
                                targetSpan.className = `${trackingStatus} font-mono`;
                                targetSpan.innerHTML = `${currentCalculatedEnergy.toFixed(1)} / ${newTargetVal.toFixed(1)} <span class="text-[9px] text-slate-500 font-semibold">PJ</span>`;
                                
                                barDiv.className = `${barColor} h-full rounded-full transition-all duration-300`;
                                barDiv.style.width = `${pct}%`;
                            }
                        });
                    });
                }
            } else {
                // DOM node exists, just update text and bar width safely
                const textSpan = document.getElementById(`fuel-text-${safeId}`);
                if (textSpan) {
                    textSpan.className = `${trackingStatus} font-mono`;
                    textSpan.innerHTML = `${calculatedEnergy.toFixed(1)} / ${targetEnergy.toFixed(1)} <span class="text-[9px] text-slate-500 font-semibold">PJ</span>`;
                }
                const barDiv = document.getElementById(`fuel-bar-${safeId}`);
                if (barDiv) {
                    barDiv.className = `${barColor} h-full rounded-full transition-all duration-300`;
                    barDiv.style.width = `${pct}%`;
                }
            }
        });
    }

    // Manage Macro Target UI Display
    const macroBase = document.getElementById("macro-base-wrapper");
    const macroProj = document.getElementById("macro-projected-wrapper");
    if (macroBase && macroProj) {
        if (isProjected) {
            macroBase.classList.add("hidden");
            macroProj.classList.remove("hidden");
            
            const baseMacro = state.selectedScenario.macro_drivers["base_year"] || {};
            const baseTargetVal = parseFloat(baseMacro.target_total) || 100.0;
            const currentMacro = state.selectedScenario.macro_drivers[state.activeYear] || {};
            const currentTargetVal = parseFloat(currentMacro.target_total) || 100.0;
            
            const pctInp = document.getElementById("macro-pct-input");
            const pjInp = document.getElementById("macro-pj-input");
            
            // Set values ONLY if not already focused to prevent overriding user typing
            if (document.activeElement !== pctInp && document.activeElement !== pjInp) {
                const deltaPct = baseTargetVal > 0 ? ((currentTargetVal / baseTargetVal) - 1) * 100 : 0;
                pctInp.value = deltaPct.toFixed(2);
                pjInp.value = currentTargetVal.toFixed(2);
            }
        } else {
            macroBase.classList.remove("hidden");
            macroProj.classList.add("hidden");
        }
    }
}


// ================= COMPARATIVE SCENARIO VIEW DASHBOARD =================

/**
 * Traverses a tree recursively to produce a flat list of node paths, weights, 
 * and calculated energies for comparison.
 */
function collectPathsAndEnergy(node, activeMacroDrivers, incomingEnergy, currentPath = [], currentCascadedWeight = 1.0) {
    let currentEnergy = incomingEnergy;
    
    const pathId = currentPath.concat(node.node_id).join(" > ");
    let results = [];
    
    results.push({
        path: pathId,
        type: "Node",
        weight: currentCascadedWeight,
        calculated_energy: currentEnergy,
        macro_driver_link: node.macro_driver_link || null
    });
    
    if (node.fuels && node.fuels.length > 0) {
        const totalFuelShare = node.fuels.reduce((sum, fuel) => sum + parseFloat(fuel.share || 0), 0.0);
        
        node.fuels.forEach(fuel => {
            const normalizedShare = totalFuelShare > 0 ? (parseFloat(fuel.share || 0) / totalFuelShare) : 0.0;
            const fuelEnergy = currentEnergy * normalizedShare;
            const fuelCascadedWeight = currentCascadedWeight * normalizedShare;
            results.push({
                path: pathId + " > " + fuel.fuel_id,
                type: "Fuel",
                weight: fuelCascadedWeight,
                calculated_energy: fuelEnergy,
                macro_driver_link: node.macro_driver_link || null
            });
        });
    }
    
    if (node.children && node.children.length > 0) {
        // Loop 1: Calculate apparent weight for each child (purely relative)
        const apparentWeights = node.children.map(child => {
            return parseFloat(child.weight || 0);
        });
        
        const totalApparent = apparentWeights.reduce((sum, w) => sum + w, 0.0);
        
        // Loop 2: Calculate childEnergy and recurse
        node.children.forEach((child, index) => {
            const apparentWeight = apparentWeights[index];
            const normWeight = totalApparent > 0 ? (apparentWeight / totalApparent) : 0.0;
            const childEnergy = currentEnergy * normWeight;
            const childCascadedWeight = currentCascadedWeight * normWeight;
            
            const childResults = collectPathsAndEnergy(
                child, 
                activeMacroDrivers, 
                childEnergy, 
                currentPath.concat(node.node_id),
                childCascadedWeight
            );
            results = results.concat(childResults);
        });
    }
    return results;
}

/**
 * Builds and renders the premium side-by-side comparison table.
 */
function renderComparisonDashboard() {
    comparisonViewContainer.innerHTML = "";
    
    const sortedScens = [...state.projectScenarios].sort((a, b) => a.target_year - b.target_year);
    if (sortedScens.length === 0) return;
    
    const baseScen = sortedScens[0];
    const activeScen = state.selectedScenario;
    
    if (baseScen.id === activeScen.id) {
        comparisonViewContainer.innerHTML = `
            <div class="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
                <i class="fa-solid fa-code-compare text-slate-600 text-3xl mb-3"></i>
                <h4 class="text-sm font-bold text-slate-400">Cannot Compare Base Scenario to Itself</h4>
                <p class="text-xs text-slate-500 mt-1">Please select or add a future projection scenario in the tabs below (e.g. 2035, 2050) to audit comparative data.</p>
            </div>
        `;
        return;
    }
    
    const baseMacro = baseScen.macro_drivers || {};
    const activeMacro = activeScen.macro_drivers || {};
    
    const baseTarget = baseMacro.target_total || baseMacro.total || 100.0;
    const activeTarget = activeMacro.target_total || activeMacro.total || 100.0;
    
    const baseFlat = collectPathsAndEnergy(baseScen.tree_state, baseMacro, baseTarget, []);
    const activeFlat = collectPathsAndEnergy(activeScen.tree_state, activeMacro, activeTarget, []);
    
    const baseMap = {};
    baseFlat.forEach(x => { baseMap[x.path] = x; });
    
    let tableRowsHtml = "";
    activeFlat.forEach(node => {
        const baseNode = baseMap[node.path] || { weight: 0.0, calculated_energy: 0.0 };
        
        const baseW = baseNode.weight;
        const activeW = node.weight;
        const diffW = activeW - baseW;
        
        const baseE = baseNode.calculated_energy;
        const activeE = node.calculated_energy;
        const diffE = activeE - baseE;
        
        let varianceBadgeHtml = "";
        if (Math.abs(diffE) < 1e-3) {
            varianceBadgeHtml = `<span class="text-slate-500">-</span>`;
        } else if (diffE > 0) {
            varianceBadgeHtml = `<span class="text-emerald-400 font-bold flex items-center gap-0.5 justify-end"><i class="fa-solid fa-arrow-trend-up"></i> +${diffE.toFixed(1)} PJ</span>`;
        } else {
            varianceBadgeHtml = `<span class="text-red-400 font-bold flex items-center gap-0.5 justify-end"><i class="fa-solid fa-arrow-trend-down"></i> ${diffE.toFixed(1)} PJ</span>`;
        }
        
        const isFuel = node.type === "Fuel";
        const pathLabel = isFuel 
            ? `<span class="text-indigo-300 font-mono text-[10px] pl-6"><i class="fa-solid fa-fire-flame-simple text-[8px] text-indigo-400/60 mr-1"></i> ${node.path}</span>` 
            : `<span class="text-white font-bold text-xs"><i class="fa-solid fa-folder text-[10px] text-blue-400/60 mr-1.5"></i> ${node.path}</span>`;
            
        tableRowsHtml += `
            <tr class="border-b border-slate-800/60 hover:bg-slate-900/20 transition-all">
                <td class="px-6 py-3.5 text-left">${pathLabel}</td>
                <td class="px-6 py-3.5 text-center font-mono text-xs text-slate-400">${isFuel ? 'Share:' : 'Weight:'} ${baseW.toFixed(2)}</td>
                <td class="px-6 py-3.5 text-center font-mono text-xs text-white">${isFuel ? 'Share:' : 'Weight:'} ${activeW.toFixed(2)}</td>
                <td class="px-6 py-3.5 text-center font-mono text-xs text-slate-400">${baseE.toFixed(1)} PJ</td>
                <td class="px-6 py-3.5 text-center font-mono text-xs text-white font-semibold">${activeE.toFixed(1)} PJ</td>
                <td class="px-6 py-3.5 text-right font-mono text-xs">${varianceBadgeHtml}</td>
            </tr>
        `;
    });
    
    comparisonViewContainer.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="bg-slate-950/40 border border-slate-850 p-4 rounded-xl flex items-center justify-between">
                <div>
                    <span class="block text-[10px] text-slate-500 uppercase tracking-wider mb-0.5 font-semibold">Base Macro Target (${baseScen.target_year})</span>
                    <span class="text-xl font-black text-slate-400 font-mono">${(baseScen.macro_drivers?.target_total || 100.0).toFixed(1)} PJ</span>
                </div>
                <div class="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center">
                    <i class="fa-solid fa-history text-slate-500"></i>
                </div>
            </div>
            
            <div class="bg-slate-950/40 border border-slate-850 p-4 rounded-xl flex items-center justify-between">
                <div>
                    <span class="block text-[10px] text-slate-500 uppercase tracking-wider mb-0.5 font-semibold">Projection Macro Target (${activeScen.target_year})</span>
                    <span class="text-xl font-black text-teal-400 font-mono">${(activeScen.macro_drivers?.target_total || 100.0).toFixed(1)} PJ</span>
                </div>
                <div class="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                    <i class="fa-solid fa-chart-area text-teal-400"></i>
                </div>
            </div>
        </div>

        <div class="glass border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <div class="overflow-x-auto">
                <table class="w-full text-slate-300">
                    <thead class="bg-slate-950 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                        <tr>
                            <th class="px-6 py-4 text-left">Sector Pathway</th>
                            <th class="px-6 py-4 text-center">Base Weight (${baseScen.target_year})</th>
                            <th class="px-6 py-4 text-center">Projection Weight (${activeScen.target_year})</th>
                            <th class="px-6 py-4 text-center">Base Energy (${baseScen.target_year})</th>
                            <th class="px-6 py-4 text-center">Projection Energy (${activeScen.target_year})</th>
                            <th class="px-6 py-4 text-right">Absolute Variance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Builds and renders the premium Results Summary dashboard.
 */
function renderResultsSummaryDashboard() {
    resultsViewContainer.innerHTML = "";
    if (!state.selectedScenario || !state.selectedScenario.tree_state) return;

    // 1. Gather all temporal years and sort them
    const years = Object.keys(state.selectedScenario.tree_state).sort((a, b) => {
        if (a === "base_year") return -1;
        if (b === "base_year") return 1;
        return parseInt(a) - parseInt(b);
    });
    
    // 2. Build a map of all unique paths across all years
    const comparativeDataMap = {};
    const baseYearPaths = new Set();
    
    years.forEach(year => {
        const tree = state.selectedScenario.tree_state[year];
        const macro = state.selectedScenario.macro_drivers[year] || {};
        const targetVal = parseFloat(macro.target_total) || parseFloat(macro.total) || 100.0;
        
        // Collect flat data for this year
        const flatData = collectPathsAndEnergy(tree, macro, targetVal, []);
        
        flatData.forEach(node => {
            const pathKey = node.path;
            
            if (year === "base_year") {
                baseYearPaths.add(pathKey);
            }
            
            if (!comparativeDataMap[pathKey]) {
                comparativeDataMap[pathKey] = {
                    type: node.type,
                    years: {}
                };
            }
            
            // Calculate Activity Level
            const activityPct = (parseFloat(node.weight || 0) * 100).toFixed(2);
            const energyPJ = node.calculated_energy.toFixed(2);
            
            // Driver logic
            let fallbackName = null;
            let fallbackVal = null;
            const availableDrivers = Object.keys(macro).filter(k => k !== "target_total" && k !== "total");
            if (macro.gdp_ppp !== undefined) {
                fallbackName = "gdp_ppp";
                fallbackVal = parseFloat(macro.gdp_ppp) || null;
            } else if (availableDrivers.length > 0) {
                fallbackName = availableDrivers[0];
                fallbackVal = parseFloat(macro[fallbackName]) || null;
            }
            
            let rowDriverName = fallbackName;
            let rowDriverValue = fallbackVal;
            if (node.macro_driver_link && macro[node.macro_driver_link] !== undefined) {
                rowDriverName = node.macro_driver_link;
                rowDriverValue = parseFloat(macro[rowDriverName]) || null;
            }
            
            let intensityHtml = `<span class="text-slate-500">N/A</span>`;
            if (rowDriverValue && rowDriverValue > 0) {
                const intensity = node.calculated_energy / rowDriverValue;
                intensityHtml = `${intensity.toFixed(4)}`;
            }
            
            comparativeDataMap[pathKey].years[year] = {
                activityPct,
                energyPJ,
                intensityHtml,
                rowDriverName,
                rowDriverValue
            };
        });
    });

    // 3. Build HTML Table dynamically
    
    // Header Generation
    let headerColsHtml = "";
    years.forEach(year => {
        const displayYear = year === "base_year" ? state.selectedScenario.target_year : year;
        headerColsHtml += `
            <th class="px-4 py-3 border-l border-slate-700 [.light-theme_&]:border-slate-300 bg-slate-800 [.light-theme_&]:bg-slate-200 text-center text-white [.light-theme_&]:text-slate-800" colspan="4">
                ${displayYear} ${year === "base_year" ? '(Base)' : ''}
            </th>
        `;
    });
    
    let subHeaderColsHtml = "";
    years.forEach(() => {
        subHeaderColsHtml += `
            <th class="px-2 py-2 border-l border-slate-700 [.light-theme_&]:border-slate-300 font-semibold text-center text-[9px] text-slate-400 [.light-theme_&]:text-slate-500">Act. Level (%)</th>
            <th class="px-2 py-2 text-center text-[9px] text-slate-400 [.light-theme_&]:text-slate-500">Energy (PJ)</th>
            <th class="px-2 py-2 text-center text-[9px] text-slate-400 [.light-theme_&]:text-slate-500">Intensity</th>
            <th class="px-2 py-2 text-center text-[9px] text-slate-400 [.light-theme_&]:text-slate-500">Macro Driver</th>
        `;
    });

    // Row Generation
    let tableRowsHtml = "";
    Object.keys(comparativeDataMap).sort().forEach(pathKey => {
        const rowData = comparativeDataMap[pathKey];
        const isNew = !baseYearPaths.has(pathKey) ? `<span class="ml-2 text-[8px] font-bold bg-teal-500/20 border border-teal-500/30 text-teal-400 px-1.5 py-0.5 rounded uppercase tracking-wider">New</span>` : "";
        const icon = rowData.type === "Node" ? `<i class="fa-solid fa-folder text-blue-400/60 text-[10px]"></i>` : `<i class="fa-solid fa-fire text-amber-400/60 text-[10px] ml-4"></i>`;
        
        let rowColsHtml = "";
        years.forEach(year => {
            const data = rowData.years[year];
            if (data) {
                const driverDisplay = data.rowDriverName ? (data.rowDriverName === 'gdp_ppp' ? 'PIB/GDP' : data.rowDriverName) : 'None';
                rowColsHtml += `
                    <td class="px-3 py-2.5 border-l border-slate-800 [.light-theme_&]:border-slate-300 text-right font-mono text-amber-400 [.light-theme_&]:text-amber-600">${data.activityPct}%</td>
                    <td class="px-3 py-2.5 text-right font-mono font-bold text-white [.light-theme_&]:text-slate-900">${data.energyPJ}</td>
                    <td class="px-3 py-2.5 text-right font-mono text-teal-400 [.light-theme_&]:text-teal-600">${data.intensityHtml}</td>
                    <td class="px-3 py-2.5 text-right text-[10px] text-slate-400 [.light-theme_&]:text-slate-500 capitalize">${driverDisplay}</td>
                `;
            } else {
                rowColsHtml += `
                    <td class="px-3 py-2.5 border-l border-slate-800 [.light-theme_&]:border-slate-300 text-center text-slate-600 [.light-theme_&]:text-slate-400" colspan="4">-</td>
                `;
            }
        });

        tableRowsHtml += `
            <tr class="hover:bg-slate-800/50 [.light-theme_&]:hover:bg-slate-100 transition-colors border-b border-slate-800/50 [.light-theme_&]:border-slate-200">
                <td class="px-4 py-2 text-slate-300 [.light-theme_&]:text-slate-800 min-w-[280px]">
                    <div class="flex items-center gap-2 whitespace-nowrap text-xs">
                        ${icon} <span class="font-bold">${pathKey}</span> ${isNew}
                    </div>
                </td>
                ${rowColsHtml}
            </tr>
        `;
    });

    resultsViewContainer.innerHTML = `
        <div class="glass border border-slate-800 [.light-theme_&]:border-slate-200 rounded-xl overflow-hidden shadow-2xl flex flex-col h-full bg-[#0b0f19] [.light-theme_&]:bg-white">
            <div class="p-5 border-b border-slate-800 [.light-theme_&]:border-slate-200 bg-slate-900/60 [.light-theme_&]:bg-slate-50 flex justify-between items-center">
                <div>
                    <h2 class="text-lg font-black text-white [.light-theme_&]:text-slate-900 flex items-center gap-2">
                        <i class="fa-solid fa-square-poll-vertical text-teal-500"></i> Multi-Year Projections Summary
                    </h2>
                    <p class="text-xs text-slate-400 [.light-theme_&]:text-slate-500 mt-1">Comparative view of bottom-up cascading paths across all optimized projection years.</p>
                </div>
            </div>
            
            <div class="flex-1 overflow-auto p-4">
                <table class="w-full text-left text-[11px] text-slate-300 [.light-theme_&]:text-slate-700">
                    <thead class="bg-slate-900 [.light-theme_&]:bg-slate-100 text-xs uppercase text-slate-400 [.light-theme_&]:text-slate-600 sticky top-0 z-20 shadow-md">
                        <tr>
                            <th class="px-4 py-3 bg-slate-900 [.light-theme_&]:bg-slate-100 sticky left-0 z-30 min-w-[280px]" rowspan="2">Sector / End-Use / Fuel Path</th>
                            ${headerColsHtml}
                        </tr>
                        <tr class="bg-slate-800/80 [.light-theme_&]:bg-slate-200 text-[9px] text-slate-500">
                            ${subHeaderColsHtml}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/50 [.light-theme_&]:divide-slate-200 relative z-10">
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function drawSVGLines() {
    const svg = document.getElementById("connections-canvas");
    const wrapper = document.getElementById("tree-pan-wrapper");
    if (!svg || !wrapper || !state.treeState) return;
    
    svg.innerHTML = "";
    const wrapRect = wrapper.getBoundingClientRect();
    
    // Helper to get coordinates relative to the scalable wrapper
    const getCoords = (el) => {
        const rect = el.getBoundingClientRect();
        return {
            x: (rect.left - wrapRect.left) / canvasZoom + (rect.width / canvasZoom) / 2,
            y: (rect.top - wrapRect.top) / canvasZoom
        };
    };

    const drawBranch = (node, pathArr) => {
        if (!node.children) return;
        const parentPathStr = pathArr.join(",");
        // Find parent card by locating an element inside it with the exact path
        const parentEl = wrapper.querySelector(`[data-path="${parentPathStr}"]`)?.closest(".tree-node-card");
        
        if (parentEl) {
            const pCoords = getCoords(parentEl);
            // Parent connection point is bottom-center
            const px = pCoords.x;
            const py = pCoords.y + (parentEl.getBoundingClientRect().height / canvasZoom);

            node.children.forEach((child, index) => {
                const childPathStr = pathArr.concat(index).join(",");
                const childEl = wrapper.querySelector(`[data-path="${childPathStr}"]`)?.closest(".tree-node-card");
                
                if (childEl) {
                    const cCoords = getCoords(childEl);
                    // Child connection point is top-center
                    const cx = cCoords.x;
                    const cy = cCoords.y;
                    
                    // SVG Bezier Curve (C) for smooth organic lines
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    const d = `M ${px} ${py} C ${px} ${py + 50}, ${cx} ${cy - 50}, ${cx} ${cy}`;
                    
                    path.setAttribute("d", d);
                    path.setAttribute("stroke", "#475569"); // slate-600
                    path.setAttribute("stroke-width", "2");
                    path.setAttribute("fill", "none");
                    path.setAttribute("opacity", "0.5");
                    
                    svg.appendChild(path);
                }
                drawBranch(child, pathArr.concat(index));
            });
        }
    };
    
    drawBranch(state.treeState, []);
}
