// Application State
let state = {
    config: {},
    projects: [],
    tasks: [],
    selectedProjectId: "",
    activeView: "board",
    activeAssignee: "All", // Default assignee filter
    logs: [],
    
    // Time Logging Modal State
    selectedTask: null,
    activeTab: "timer",
    timerInterval: null,
    timerSeconds: 0,
    timerRunning: false
};

// DOM Elements
const projectSelect = document.getElementById("project-select");
const userFilter = document.getElementById("user-filter");
const viewTitle = document.getElementById("view-title");
const viewSubtitle = document.getElementById("view-subtitle");
const oauthStatusBox = document.getElementById("oauth-status-box");
const authZohoBtn = document.getElementById("auth-zoho-btn");
const syncNowBtn = document.getElementById("sync-now-btn");
const syncHistoryBtn = document.getElementById("sync-history-btn");
const localLogsCount = document.getElementById("local-logs-count");

// Modal Elements
const timeLogModal = document.getElementById("time-log-modal");
const closeModalBtn = document.getElementById("close-modal-btn");
const cancelLogBtn = document.getElementById("cancel-log-btn");
const saveLogBtn = document.getElementById("save-log-btn");
const modalTaskTitle = document.getElementById("modal-task-title");
const modalProjectTitle = document.getElementById("modal-project-title");
const logNotes = document.getElementById("log-notes");

// Timer Elements
const timerText = document.getElementById("timer-text");
const timerStartBtn = document.getElementById("timer-start-btn");
const timerPauseBtn = document.getElementById("timer-pause-btn");
const timerStopBtn = document.getElementById("timer-stop-btn");

// Manual Input Elements
const manualHoursInput = document.getElementById("manual-hours");
const manualStartInput = document.getElementById("manual-start");
const manualEndInput = document.getElementById("manual-end");

// Toast Notification
const toast = document.getElementById("toast");

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

async function initApp() {
    await fetchConfig();
    await fetchProjects();
    await fetchLogs();
}

function setupEventListeners() {
    // Project switcher
    projectSelect.addEventListener("change", (e) => {
        state.selectedProjectId = e.target.value;
        if (state.selectedProjectId === "All") {
            viewSubtitle.innerText = "All Projects";
            fetchTasks("All");
        } else {
            const project = state.projects.find(p => p.id === state.selectedProjectId);
            if (project) {
                viewSubtitle.innerText = project.name;
                fetchTasks(state.selectedProjectId);
            }
        }
    });

    // Assignee filter
    userFilter.addEventListener("change", (e) => {
        state.activeAssignee = e.target.value;
        renderActiveView();
    });

    // Navigation (view switcher)
    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
            item.classList.add("active");
            
            state.activeView = item.dataset.view;
            
            // Format view title
            const titles = {
                board: "Board View",
                list: "List View",
                history: "Local Logs History"
            };
            viewTitle.innerText = titles[state.activeView];
            
            document.querySelectorAll(".view-panel").forEach(panel => panel.classList.remove("active"));
            document.getElementById(`${state.activeView}-view`).classList.add("active");
            
            renderActiveView();
        });
    });



    // Auth Zoho Redirect
    authZohoBtn.addEventListener("click", () => {
        window.location.href = "/authorize";
    });

    const reconnectZohoBtn = document.getElementById("reconnect-zoho-btn");
    if (reconnectZohoBtn) {
        reconnectZohoBtn.addEventListener("click", () => {
            window.location.href = "/authorize";
        });
    }

    // Theme toggle button logic
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const savedTheme = localStorage.getItem("theme") || "dark";
    
    // Clean and apply theme class
    document.body.classList.remove("light-theme", "dark-theme");
    document.body.classList.add(savedTheme + "-theme");
    updateThemeIcon(savedTheme);
    
    themeToggleBtn.addEventListener("click", () => {
        const isLight = document.body.classList.contains("light-theme");
        const currentTheme = isLight ? "dark" : "light";
        
        document.body.classList.remove("light-theme", "dark-theme");
        document.body.classList.add(currentTheme + "-theme");
        localStorage.setItem("theme", currentTheme);
        updateThemeIcon(currentTheme);
    });

    function updateThemeIcon(theme) {
        const icon = themeToggleBtn.querySelector("i");
        if (icon) {
            if (theme === "light") {
                icon.className = "fa-solid fa-sun";
            } else {
                icon.className = "fa-solid fa-moon";
            }
        }
    }

    // Sync Actions
    syncNowBtn.addEventListener("click", triggerSync);
    syncHistoryBtn.addEventListener("click", triggerSync);

    // Modal Close
    closeModalBtn.addEventListener("click", closeModal);
    cancelLogBtn.addEventListener("click", closeModal);
    
    // Tab Switches in Modal
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            state.activeTab = btn.dataset.tab;
            document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
            document.getElementById(`tab-${state.activeTab}`).classList.add("active");
        });
    });

    // Billable rate toggle removed

    // Timer control buttons
    timerStartBtn.addEventListener("click", startTimer);
    timerPauseBtn.addEventListener("click", pauseTimer);
    timerStopBtn.addEventListener("click", stopTimer);

    // Manual Time calculation triggers
    manualStartInput.addEventListener("change", calculateManualHours);
    manualEndInput.addEventListener("change", calculateManualHours);

    // Save Timesheet Entry
    saveLogBtn.addEventListener("click", saveTimesheetLog);
}

// --- Fetch Configuration & Token Status ---
async function fetchConfig() {
    try {
        const res = await fetch("/api/config");
        state.config = await res.json();
        


        // Show/hide oauth link button
        if (!state.config.is_authorized) {
            oauthStatusBox.style.display = "block";
        } else {
            oauthStatusBox.style.display = "none";
        }
    } catch (e) {
        console.error("Config fetch error:", e);
    }
}

// --- Fetch Data ---
async function fetchProjects() {
    try {
        const res = await fetch("/api/projects");
        if (!res.ok) {
            if (res.status === 401) {
                oauthStatusBox.style.display = "block";
            }
            throw new Error("Could not fetch projects");
        }
        state.projects = await res.json();
        
        projectSelect.innerHTML = "";
        if (state.projects.length === 0) {
            projectSelect.innerHTML = '<option value="">No Projects Found</option>';
            return;
        }
        
        // Add "All Projects" option
        const allOpt = document.createElement("option");
        allOpt.value = "All";
        allOpt.innerText = "All Projects";
        projectSelect.appendChild(allOpt);
        
        state.projects.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.innerText = p.name;
            projectSelect.appendChild(opt);
        });
        
        // Default to "All Projects"
        state.selectedProjectId = "All";
        viewSubtitle.innerText = "All Projects";
        await fetchTasks("All");
    } catch (e) {
        console.error("Projects load error:", e);
        projectSelect.innerHTML = '<option value="">Error Loading Projects</option>';
    }
}

async function fetchTasks(projectId) {
    try {
        const res = await fetch(`/api/tasks?project_id=${projectId}`);
        if (!res.ok) throw new Error("Tasks failed to fetch");
        state.tasks = await res.json();
        
        // Dynamically update assignee options
        updateAssigneeFilterOptions();
        
        renderActiveView();
    } catch (e) {
        console.error("Tasks fetch error:", e);
        showToast("Error loading tasks from Zoho. Make sure you are authorized.", "error");
    }
}

function updateAssigneeFilterOptions() {
    const userFilter = document.getElementById("user-filter");
    if (!userFilter) return;
    
    // Collect all unique assignees present in current project tasks (split multi-assignees)
    const assignees = new Set();
    state.tasks.forEach(t => {
        if (t.assignee && t.assignee.trim()) {
            const parts = t.assignee.split(",");
            parts.forEach(p => {
                if (p.trim()) {
                    assignees.add(p.trim());
                }
            });
        }
    });
    
    const previousSelection = state.activeAssignee;
    userFilter.innerHTML = "";
    
    // 1. Add "All" option (default)
    const allOpt = document.createElement("option");
    allOpt.value = "All";
    allOpt.innerText = "All Team";
    userFilter.appendChild(allOpt);
    
    // 2. Add each unique assignee
    assignees.forEach(name => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.innerText = name;
        userFilter.appendChild(opt);
    });
    
    // Restore selection if still valid, otherwise default to All
    if (assignees.has(previousSelection)) {
        userFilter.value = previousSelection;
        state.activeAssignee = previousSelection;
    } else {
        userFilter.value = "All";
        state.activeAssignee = "All";
    }
}

async function fetchLogs() {
    try {
        const res = await fetch("/api/logs");
        state.logs = await res.json();
        
        // Update badge counts
        const pendingCount = state.logs.filter(l => l.status === "Pending").length;
        localLogsCount.innerText = pendingCount;
    } catch (e) {
        console.error("Logs load error:", e);
    }
}

// --- Rendering Logic ---
function renderActiveView() {
    // Filter tasks based on assignee selection
    const filteredTasks = state.tasks.filter(t => {
        if (state.activeAssignee === "All") return true;
        if (!t.assignee) return false;
        
        // Split and match any assignee parts
        const parts = t.assignee.split(",").map(p => p.trim());
        return parts.includes(state.activeAssignee);
    });

    if (state.activeView === "board") {
        renderBoardView(filteredTasks);
    } else if (state.activeView === "list") {
        renderListView(filteredTasks);
    } else if (state.activeView === "history") {
        renderHistoryLogs();
    }
}

// Board Columns renderer
function renderBoardView(filteredTasks) {
    const boardColumnsContainer = document.getElementById("board-columns");
    if (!boardColumnsContainer) return;
    
    // Clear container
    boardColumnsContainer.innerHTML = "";
    
    // Extract unique statuses from state.tasks (to show all pipeline columns in this project)
    let uniqueStatuses = [...new Set(state.tasks.map(t => t.status))];
    
    // If there are no tasks, default to standard columns
    if (uniqueStatuses.length === 0) {
        uniqueStatuses = ["To Do", "In Progress", "Review", "Done"];
    } else {
        // Sort statuses logically
        const orderHeuristic = (status) => {
            const s = status.toLowerCase();
            if (s.includes("open") || s.includes("todo") || s.includes("to do")) return 1;
            if (s.includes("progress") || s.includes("active") || s.includes("working")) return 2;
            if (s.includes("review") || s.includes("qa") || s.includes("test")) return 3;
            if (s.includes("done") || s.includes("close") || s.includes("complete")) return 4;
            return 5;
        };
        uniqueStatuses.sort((a, b) => orderHeuristic(a) - orderHeuristic(b));
    }
    
    // Create columns map for easy task insertion
    const columnsMap = {};
    uniqueStatuses.forEach(status => {
        const col = document.createElement("div");
        col.className = "board-column";
        col.dataset.status = status.toLowerCase();
        col.innerHTML = `
            <div class="column-header">
                <h3>${status}</h3>
                <span class="badge count">0</span>
            </div>
            <div class="task-cards-list"></div>
        `;
        boardColumnsContainer.appendChild(col);
        columnsMap[status.toLowerCase()] = {
            list: col.querySelector(".task-cards-list"),
            countBadge: col.querySelector(".count"),
            count: 0
        };
    });
    
    // Populate columns with filtered tasks
    filteredTasks.forEach(task => {
        const statusKey = task.status.toLowerCase();
        const colMeta = columnsMap[statusKey];
        if (!colMeta) return;
        
        const card = document.createElement("div");
        card.className = "card task-card";
        card.innerHTML = `
            <div class="task-card-header">
                ${task.project_name ? `<span class="project-badge-tag" style="font-size: 10.5px; font-weight: 700; color: var(--primary); background-color: rgba(219, 244, 167, 0.08); border: 1px solid rgba(219, 244, 167, 0.18); padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;"><i class="fa-solid fa-folder" style="font-size: 9px; margin-right: 4px;"></i>${task.project_name}</span>` : ''}
                <h4 class="task-card-title">${task.name}</h4>
            </div>
            <div class="task-card-footer">
                <span class="assignee-tag" title="${task.assignee}"><i class="fa-solid fa-user"></i> ${task.assignee}</span>
                ${task.priority && task.priority !== 'None' ? `<span class="priority-tag ${task.priority.toLowerCase()}"><i class="fa-solid fa-circle-exclamation"></i> ${task.priority}</span>` : ''}
            </div>
        `;
        
        card.addEventListener("click", () => openTimeLogModal(task));
        colMeta.list.appendChild(card);
        colMeta.count++;
        colMeta.countBadge.innerText = colMeta.count;
    });
}

// List View renderer
function renderListView(filteredTasks) {
    const listBody = document.getElementById("list-tasks-body");
    listBody.innerHTML = "";
    
    if (filteredTasks.length === 0) {
        listBody.innerHTML = `<tr><td colspan="6" style="text-align: center;" class="text-secondary">No tasks available for this filter.</td></tr>`;
        return;
    }
    
    filteredTasks.forEach(task => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><code>${task.id}</code></td>
            <td>
                <strong>${task.name}</strong>
                ${task.priority && task.priority !== 'None' ? `<span class="priority-tag ${task.priority.toLowerCase()}" style="margin-left: 8px; font-size: 9.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.3px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-exclamation" style="font-size: 8.5px;"></i> ${task.priority}</span>` : ''}
            </td>
            <td>${task.assignee}</td>
            <td><span class="status-badge ${task.status.toLowerCase().replace(" ", "-")}">${task.status}</span></td>
            <td class="text-secondary">${task.start_date || 'N/A'} to ${task.end_date || 'N/A'}</td>
            <td style="text-align: right;">
                <button class="primary-btn btn-sm" onclick="openTimeLogModalById('${task.id}')">
                    <i class="fa-solid fa-clock"></i> Log Time
                </button>
            </td>
        `;
        listBody.appendChild(row);
    });
}



function getDisplayName(email) {
    if (!email) return "Unknown";
    const emailLower = email.toLowerCase();
    if (emailLower.includes("kaurgurjeet3010") || emailLower.includes("gurjeet")) {
        return "Gurjeet Kaur";
    }
    if (emailLower.includes("vindhya")) {
        return "Vindhya Kesharwani";
    }
    if (emailLower.includes("aashay")) {
        return "Aashay Soni";
    }
    if (emailLower.includes("rahul")) {
        return "Rahul Patel";
    }
    const parts = emailLower.split("@")[0].split(/[\.\-_]/);
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// Local logs history table renderer
function renderHistoryLogs() {
    const logsBody = document.getElementById("history-logs-body");
    logsBody.innerHTML = "";
    
    if (state.logs.length === 0) {
        logsBody.innerHTML = `<tr><td colspan="7" style="text-align: center;" class="text-secondary">No saved logs in SQLite. Create logs using task cards.</td></tr>`;
        return;
    }
    
    state.logs.forEach(log => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td class="col-project"><strong>${log.project_name || 'Project'}</strong></td>
            <td class="col-task">${log.task_name || 'Task'}</td>
            <td class="col-user"><strong>${getDisplayName(log.user_email)}</strong></td>
            <td class="col-hours"><strong>${log.hours.toFixed(2)} hrs</strong></td>
            <td class="col-type">${log.billable ? '<span class="status-badge done">Billable</span>' : '<span class="status-badge to-do">Non-Billable</span>'}</td>
            <td class="col-date text-secondary">${new Date(log.logged_at).toLocaleString()}</td>
            <td class="col-status">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
                    <span class="sync-status ${log.status}">
                        <i class="fa-solid ${log.status === 'Synced' ? 'fa-circle-check' : 'fa-circle-notch fa-spin'}"></i>
                        ${log.status}
                    </span>
                    ${log.status === 'Pending' ? `
                        <button class="primary-btn btn-sm delete-log-btn" style="background: rgba(239, 22, 22, 0.1); color: #ff4a4a; border: 1px solid rgba(239, 22, 22, 0.2); padding: 4px 8px; border-radius: 6px; cursor: pointer; transition: 0.2s;" onclick="deletePendingLog(${log.id})">
                            <i class="fa-solid fa-trash" style="font-size: 10px;"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        `;
        logsBody.appendChild(row);
    });
}

// Delete pending log handler
window.deletePendingLog = async function(logId) {
    if (!confirm("Are you sure you want to delete this pending log?")) return;
    try {
        const res = await fetch(`/api/logs/delete/${logId}`, { method: "POST" });
        if (res.ok) {
            showToast("Pending log deleted successfully.", "success");
            fetchLogs(); // Reload logs list from server
        } else {
            showToast("Failed to delete pending log.", "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Error deleting log.", "error");
    }
};

// Helper to open modal using Task ID
window.openTimeLogModalById = function(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) openTimeLogModal(task);
};

// --- Modal Operations ---
function openTimeLogModal(task) {
    state.selectedTask = task;
    modalTaskTitle.innerText = task.name;
    const project = state.projects.find(p => p.id === state.selectedProjectId);
    modalProjectTitle.innerText = project ? project.name : "Active Project";
    
    // Display Zoho task description if available
    const descContainer = document.getElementById("modal-task-desc-container");
    const descText = document.getElementById("modal-task-desc");
    if (descContainer && descText) {
        if (task.description && task.description.trim()) {
            descText.innerHTML = task.description.trim();
            descContainer.style.display = "block";
        } else {
            descText.innerHTML = "";
            descContainer.style.display = "none";
        }
    }
    
    // Reset inputs
    state.timerSeconds = 0;
    state.timerRunning = false;
    timerText.innerText = "00:00:00";
    manualHoursInput.value = "";
    manualStartInput.value = "";
    manualEndInput.value = "";
    logNotes.value = "";
    
    // Dynamically populate Log As User options based on task assignees
    const logUserSelect = document.getElementById("log-user");
    if (logUserSelect) {
        logUserSelect.innerHTML = "";
        const allPossibleUsers = ["Gurjeet Kaur", "Vindhya Kesharwani", "Aashay Soni", "Rahul Patel"];
        
        const assigneesStr = task.assignee || "";
        const taskAssignees = assigneesStr.split(",")
            .map(a => a.trim())
            .filter(a => a && a !== "Unassigned");
            
        const validAssignees = taskAssignees.filter(a => allPossibleUsers.includes(a));
        const finalUsers = validAssignees.length > 0 ? validAssignees : allPossibleUsers;
        
        finalUsers.forEach(user => {
            const opt = document.createElement("option");
            opt.value = user;
            opt.innerText = user;
            logUserSelect.appendChild(opt);
        });
        
        logUserSelect.value = finalUsers[0];
    }
    
    // Enable/disable buttons
    timerStartBtn.disabled = false;
    timerPauseBtn.disabled = true;
    timerStopBtn.disabled = true;
    
    // Show Modal
    timeLogModal.classList.add("active");

    // Fetch and render attachments
    fetchAndRenderAttachments(state.selectedProjectId, task.id);
}

async function fetchAndRenderAttachments(projectId, taskId) {
    const container = document.getElementById("modal-attachments-container");
    const list = document.getElementById("modal-attachments-list");
    if (!container || !list) return;

    // Show container with a loading state
    container.style.display = "block";
    list.innerHTML = `<div style="color: var(--text-secondary); font-style: italic;"><i class="fa-solid fa-spinner fa-spin"></i> Loading attachments...</div>`;

    try {
        const res = await fetch(`/api/tasks/${projectId}/${taskId}/attachments`);
        if (!res.ok) throw new Error("Failed to fetch attachments");
        const attachments = await res.json();

        if (!attachments || attachments.length === 0) {
            // Hide container if there are no attachments
            container.style.display = "none";
            list.innerHTML = "";
            return;
        }

        list.innerHTML = "";
        attachments.forEach(att => {
            const ext = att.name.split('.').pop().toLowerCase();
            let iconClass = "fa-file";
            if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
                iconClass = "fa-file-image";
            } else if (ext === "pdf") {
                iconClass = "fa-file-pdf";
            } else if (["doc", "docx"].includes(ext)) {
                iconClass = "fa-file-word";
            } else if (["xls", "xlsx", "csv"].includes(ext)) {
                iconClass = "fa-file-excel";
            } else if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
                iconClass = "fa-file-zipper";
            }

            const item = document.createElement("a");
            item.className = "attachment-item";
            item.href = att.url;
            item.target = "_blank";
            item.title = `Click to download/preview ${att.name}`;
            item.innerHTML = `
                <div class="attachment-left">
                    <i class="fa-solid ${iconClass} attachment-icon"></i>
                    <span class="attachment-name">${att.name}</span>
                </div>
                <div class="attachment-right">
                    <span class="attachment-size">${att.size_formatted}</span>
                    <i class="fa-solid fa-download attachment-download"></i>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (err) {
        console.error("Attachments load error:", err);
        list.innerHTML = `<div style="color: var(--danger);"><i class="fa-solid fa-circle-exclamation"></i> Error loading attachments</div>`;
    }
}

function closeModal() {
    // Reset timer interval if running
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
    timeLogModal.classList.remove("active");
}

// --- Stop Watch Timer Logic ---
function startTimer() {
    if (state.timerRunning) return;
    
    state.timerRunning = true;
    timerStartBtn.disabled = true;
    timerPauseBtn.disabled = false;
    timerStopBtn.disabled = false;
    
    state.timerInterval = setInterval(() => {
        state.timerSeconds++;
        
        const hrs = Math.floor(state.timerSeconds / 3600);
        const mins = Math.floor((state.timerSeconds % 3600) / 60);
        const secs = state.timerSeconds % 60;
        
        timerText.innerText = 
            `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

function pauseTimer() {
    if (!state.timerRunning) return;
    
    state.timerRunning = false;
    clearInterval(state.timerInterval);
    state.timerInterval = null;
    
    timerStartBtn.disabled = false;
    timerPauseBtn.disabled = true;
}

function stopTimer() {
    pauseTimer();
    
    // Convert seconds to decimal hours
    const decimalHours = (state.timerSeconds / 3600).toFixed(2);
    manualHoursInput.value = decimalHours;
    
    // Automatically switch tabs to manual and populate value
    document.querySelector('.tab-btn[data-tab="manual"]').click();
}

// Manual mode start/end time hours calculator
function calculateManualHours() {
    const startTime = manualStartInput.value;
    const endTime = manualEndInput.value;
    
    if (!startTime || !endTime) return;
    
    const [sHrs, sMins] = startTime.split(":").map(Number);
    const [eHrs, eMins] = endTime.split(":").map(Number);
    
    let diffMins = (eHrs * 60 + eMins) - (sHrs * 60 + sMins);
    if (diffMins < 0) {
        diffMins += 24 * 60; // crossover midnight
    }
    
    manualHoursInput.value = (diffMins / 60).toFixed(2);
}

// Save log to SQLite local database
async function saveTimesheetLog() {
    let hours = parseFloat(manualHoursInput.value);
    
    if (state.activeTab === "timer" && state.timerSeconds > 0 && isNaN(hours)) {
        hours = state.timerSeconds / 3600;
    }
    
    if (isNaN(hours) || hours <= 0) {
        showToast("Please enter a valid amount of time.", "error");
        return;
    }
    
    const selectedUserName = document.getElementById("log-user").value || "Gurjeet Kaur";
    let userEmail = "";
    if (selectedUserName === "Gurjeet Kaur") {
        userEmail = "kaurgurjeet3010@gmail.com";
    } else {
        userEmail = `${selectedUserName.toLowerCase().replace(/\s+/g, "")}@company.com`;
    }
    
    const project = state.projects.find(p => p.id === state.selectedProjectId);
    const payload = {
        task_id: state.selectedTask.id,
        task_name: state.selectedTask.name,
        project_id: state.selectedTask.project_id || state.selectedProjectId,
        project_name: state.selectedTask.project_name || (project ? project.name : "Active Project"),
        user_email: userEmail,
        hours: hours,
        billable: 1,
        rate: 0.0,
        notes: logNotes.value
    };
    
    try {
        const res = await fetch("/api/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error("Database save failed");
        
        showToast(`Timesheet entry saved successfully for task: ${state.selectedTask.name}!`, "success");
        closeModal();
        await fetchLogs();
        
        // Automatically open history view to see the logged item
        document.querySelector('.nav-item[data-view="history"]').click();
    } catch (err) {
        console.error("Save log error:", err);
        showToast("Failed to save log entry locally.", "error");
    }
}

// --- Sync to Zoho People ---
async function triggerSync() {
    try {
        showToast("Starting synchronization...", "warning");
        const res = await fetch("/api/sync", { method: "POST" });
        const data = await res.json();
        
        showToast(data.message, "success");
        await fetchLogs();
        renderActiveView();
    } catch (err) {
        console.error("Sync error:", err);
        showToast("Syncing logs to Zoho People failed.", "error");
    }
}

// --- UI Toast Notifications ---
function showToast(message, type = "success") {
    toast.innerText = message;
    toast.className = `toast active ${type}`;
    
    setTimeout(() => {
        toast.classList.remove("active");
    }, 4000);
}
