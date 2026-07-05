import os
import time
import sqlite3
import uvicorn
import requests
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import hashlib
import json

# Load env variables from .env file and override existing ones
load_dotenv(override=True)

app = FastAPI(title="Zoho Projects Timesheet Dashboard")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def check_login(request: Request, call_next):
    path = request.url.path
    if path in ["/", "/index.html"]:
        session_user = request.cookies.get("session_user")
        if not session_user:
            return RedirectResponse(url="/login.html")
    elif path.startswith("/api/") and path != "/api/login":
        session_user = request.cookies.get("session_user")
        if not session_user:
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    
    response = await call_next(request)
    return response

@app.post("/api/login")
async def api_login(request: Request):
    data = await request.json()
    username = data.get("username")
    password = data.get("password")
    
    try:
        with open("users.json", "r") as f:
            users = json.load(f)
    except Exception:
        users = []
        
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    user_found = None
    for u in users:
        if u.get("username") == username and u.get("passwordHash") == password_hash:
            user_found = u
            break
            
    if not user_found:
        return JSONResponse(status_code=401, content={"detail": "Invalid username or password"})
        
    response = JSONResponse(content={"success": True})
    response.set_cookie(key="session_user", value=username, max_age=86400, path="/")
    return response

@app.get("/api/logout")
def api_logout():
    response = RedirectResponse(url="/login.html")
    response.delete_cookie(key="session_user", path="/")
    return response

DB_PATH = "db.sqlite3"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS time_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            task_name TEXT,
            project_id TEXT NOT NULL,
            project_name TEXT,
            user_email TEXT NOT NULL,
            hours REAL NOT NULL,
            billable INTEGER DEFAULT 1,
            rate REAL DEFAULT 0.0,
            notes TEXT,
            logged_at TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'Pending'
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS config_store (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

def get_config_value(key: str) -> str:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM config_store WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception:
        return None

def set_config_value(key: str, value: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO config_store (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error setting config value {key}: {e}")

# --- Zoho OAuth Configuration Helpers ---
def get_env_value(key: str) -> str:
    return os.getenv(key, "")

def get_zoho_domain() -> str:
    return get_env_value("ZOHO_DOMAIN") or "com"

def update_env_file(key: str, value: str):
    # Read the existing .env
    lines = []
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            lines = f.readlines()
    
    # Update or append key
    updated = False
    new_lines = []
    for line in lines:
        if line.strip().startswith(f"{key}="):
            new_lines.append(f"{key}={value}\n")
            updated = True
        else:
            new_lines.append(line)
            
    if not updated:
        new_lines.append(f"{key}={value}\n")
        
    with open(".env", "w") as f:
        f.writelines(new_lines)
    
    # Also update current env
    os.environ[key] = value

# Helper to exchange code/refresh token for access token
def get_access_token():
    # 1. Check persistent SQLite cache first
    cached_token = get_config_value("zoho_access_token")
    cached_expires = get_config_value("zoho_token_expires_at")
    
    if cached_token and cached_expires:
        try:
            expires_at = float(cached_expires)
            if time.time() < expires_at - 60:
                return cached_token
        except ValueError:
            pass
            
    # 2. If expired or missing, refresh from Zoho using refresh_token
    refresh_token = get_env_value("ZOHO_REFRESH_TOKEN")
    client_id = get_env_value("ZOHO_CLIENT_ID")
    client_secret = get_env_value("ZOHO_CLIENT_SECRET")
    redirect_uri = get_env_value("ZOHO_REDIRECT_URI")
    
    if not refresh_token or not client_id or not client_secret:
        return None
        
    domain = get_zoho_domain()
    url = f"https://accounts.zoho.{domain}/oauth/v2/token"
    params = {
        "refresh_token": refresh_token,
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "refresh_token",
        "redirect_uri": redirect_uri
    }
    
    try:
        response = requests.post(url, data=params, timeout=10)
        data = response.json()
        if "access_token" in data:
            access_token = data["access_token"]
            expires_in = data.get("expires_in", 3600)
            expires_at = time.time() + expires_in
            
            # Save to persistent SQLite cache
            set_config_value("zoho_access_token", access_token)
            set_config_value("zoho_token_expires_at", str(expires_at))
            return access_token
    except Exception as e:
        print("Error refreshing access token:", e)
    return None

# Helper to fetch portals (required to fetch projects)
def get_portal_id(access_token):
    domain = get_zoho_domain()
    url = f"https://projectsapi.zoho.{domain}/restapi/portals/"
    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}
    try:
        res = requests.get(url, headers=headers)
        portals = res.json().get("portals", [])
        if portals:
            return portals[0].get("id")
    except Exception as e:
        print("Error fetching Portal ID:", e)
    return None

# --- Mock Data ---
MOCK_PROJECTS = [
    {"id": "p1", "name": "E-Commerce App Redesign"},
    {"id": "p2", "name": "HR Portal Automation"},
    {"id": "p3", "name": "Marketing Landing Page"}
]

MOCK_TASKS = {
    "p1": [
        {"id": "t101", "name": "Design Figma Mockups", "status": "In Progress", "assignee": "Aman", "start_date": "2026-07-01", "end_date": "2026-07-05", "description": "Create high-fidelity mockups for landing page and dashboard. Ensure it has luxury aesthetic.", "priority": "High"},
        {"id": "t102", "name": "Setup Database Schema", "status": "To Do", "assignee": "Aman", "start_date": "2026-07-03", "end_date": "2026-07-06", "description": "", "priority": "Medium"},
        {"id": "t103", "name": "Frontend Boilerplate Setup", "status": "Done", "assignee": "Rohan", "start_date": "2026-06-28", "end_date": "2026-06-30", "description": "Initialize react app with vite, setup tailwind CSS, folder structure, router and basic layout.", "priority": "None"},
        {"id": "t104", "name": "Stripe Payment Gateway Integration", "status": "Review", "assignee": "Aman", "start_date": "2026-07-04", "end_date": "2026-07-08", "description": "", "priority": "High"}
    ],
    "p2": [
        {"id": "t201", "name": "Zoho OAuth Configuration", "status": "In Progress", "assignee": "Aman", "start_date": "2026-07-01", "end_date": "2026-07-03", "description": "Setup Zoho console, handle redirection, exchange tokens and implement token refresh callback.", "priority": "Medium"},
        {"id": "t202", "name": "Sync Timesheets API", "status": "To Do", "assignee": "Rohan", "start_date": "2026-07-02", "end_date": "2026-07-07", "description": "", "priority": "High"}
    ],
    "p3": [
        {"id": "t301", "name": "SEO & Content Writing", "status": "To Do", "assignee": "Aisha", "start_date": "2026-07-01", "end_date": "2026-07-02", "description": "Optimize content keywords, meta descriptions and run Google Lighthouse audits.", "priority": "Low"}
    ]
}

# --- API Endpoints ---

@app.get("/api/config")
def get_config():
    is_mock = get_env_value("MOCK_MODE") == "True"
    has_credentials = bool(get_env_value("ZOHO_CLIENT_ID") and get_env_value("ZOHO_CLIENT_SECRET"))
    is_authorized = bool(get_env_value("ZOHO_REFRESH_TOKEN"))
    
    return {
        "mock_mode": is_mock,
        "has_credentials": has_credentials,
        "is_authorized": is_authorized,
        "redirect_uri": get_env_value("ZOHO_REDIRECT_URI")
    }

@app.post("/api/toggle-mode")
def toggle_mode():
    is_mock = get_env_value("MOCK_MODE") == "True"
    new_mode = "False" if is_mock else "True"
    
    # If switching to Real Mode, check if refresh token is present
    if new_mode == "False" and not get_env_value("ZOHO_REFRESH_TOKEN"):
        raise HTTPException(status_code=400, detail="Cannot switch to Real Mode without authorizing Zoho first.")
        
    update_env_file("MOCK_MODE", new_mode)
    return {"mock_mode": new_mode == "True"}

@app.get("/api/projects")
def get_projects():
    is_mock = get_env_value("MOCK_MODE") == "True"
    if is_mock:
        return MOCK_PROJECTS
        
    token = get_access_token()
    if not token:
        raise HTTPException(status_code=401, detail="Zoho not authorized or credentials invalid.")
        
    portal_id = get_portal_id(token)
    if not portal_id:
         raise HTTPException(status_code=400, detail="Unable to fetch Zoho Portal ID.")
         
    domain = get_zoho_domain()
    url = f"https://projectsapi.zoho.{domain}/restapi/portal/{portal_id}/projects/"
    headers = {"Authorization": f"Zoho-oauthtoken {token}"}
    
    try:
        res = requests.get(url, headers=headers)
        if res.status_code == 204 or not res.text.strip():
            return []
        res_data = res.json()
        projects = []
        for p in res_data.get("projects", []):
            projects.append({"id": str(p["id"]), "name": p["name"]})
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch Zoho projects: {str(e)}")

@app.get("/api/tasks")
def get_tasks(project_id: str = Query(...)):
    is_mock = get_env_value("MOCK_MODE") == "True"
    if is_mock:
        if project_id == "All":
            all_tasks = []
            for pid, tasks_list in MOCK_TASKS.items():
                pname = next((p["name"] for p in MOCK_PROJECTS if p["id"] == pid), "Active Project")
                for t in tasks_list:
                    t_copy = t.copy()
                    t_copy["project_id"] = pid
                    t_copy["project_name"] = pname
                    all_tasks.append(t_copy)
            return all_tasks
        else:
            pname = next((p["name"] for p in MOCK_PROJECTS if p["id"] == project_id), "Active Project")
            tasks_list = MOCK_TASKS.get(project_id, [])
            all_tasks = []
            for t in tasks_list:
                t_copy = t.copy()
                t_copy["project_id"] = project_id
                t_copy["project_name"] = pname
                all_tasks.append(t_copy)
            return all_tasks
        
    token = get_access_token()
    if not token:
        raise HTTPException(status_code=401, detail="Zoho not authorized.")
        
    portal_id = get_portal_id(token)
    if not portal_id:
         raise HTTPException(status_code=400, detail="Unable to fetch Zoho Portal ID.")
         
    domain = get_zoho_domain()
    
    project_ids = []
    projects = []
    try:
        projects = get_projects()
        if project_id == "All":
            project_ids = [p["id"] for p in projects]
        else:
            project_ids = [project_id]
    except Exception as e:
        print("Error retrieving projects inside get_tasks:", e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")
        
    tasks = []
    headers = {"Authorization": f"Zoho-oauthtoken {token}"}
    
    for pid in project_ids:
        url = f"https://projectsapi.zoho.{domain}/restapi/portal/{portal_id}/projects/{pid}/tasks/"
        pname = next((p["name"] for p in projects if p["id"] == pid), "Active Project")
        try:
            res = requests.get(url, headers=headers)
            if res.status_code == 204 or not res.text.strip():
                continue
            res_data = res.json()
            for t in res_data.get("tasks", []):
                status_name = t.get("status", {}).get("name", "To Do")
                
                custom_assignee = None
                for cf in t.get("custom_fields", []):
                    if cf.get("label_name") == "Assigned User" and cf.get("value"):
                        custom_assignee = cf.get("value")
                        break
                
                if custom_assignee:
                    assignee_name = custom_assignee
                else:
                    assignee_name = "Unassigned"
                    if t.get("associates"):
                        assignee_name = t["associates"][0].get("name", "Unassigned")
                    elif t.get("details", {}).get("owners"):
                        assignee_name = t["details"]["owners"][0].get("name", "Unassigned")
                    
                tasks.append({
                    "id": str(t["id"]),
                    "name": t["name"],
                    "status": status_name,
                    "assignee": assignee_name,
                    "start_date": t.get("start_date", ""),
                    "end_date": t.get("end_date", ""),
                    "description": t.get("description", ""),
                    "priority": t.get("priority", "None"),
                    "project_id": str(pid),
                    "project_name": pname
                })
        except Exception as e:
            print(f"Failed to fetch Zoho tasks for project {pid}: {str(e)}")
            continue
            
    return tasks


@app.get("/api/tasks/{project_id}/{task_id}/attachments")
def get_task_attachments(project_id: str, task_id: str):
    is_mock = get_env_value("MOCK_MODE") == "True"
    if is_mock:
        return [
            {"id": "mock_a1", "name": "System_Requirements_Spec.pdf", "size_formatted": "1.24 MB", "url": "#"},
            {"id": "mock_a2", "name": "Gantt_Chart_v2.png", "size_formatted": "2.40 MB", "url": "#"}
        ]
        
    token = get_access_token()
    if not token:
        raise HTTPException(status_code=401, detail="Zoho not authorized.")
        
    portal_id = get_portal_id(token)
    if not portal_id:
         raise HTTPException(status_code=400, detail="Unable to fetch Zoho Portal ID.")
         
    domain = get_zoho_domain()
    url = f"https://projectsapi.zoho.{domain}/api/v3/portal/{portal_id}/projects/{project_id}/tasks/{task_id}/attachments"
    headers = {"Authorization": f"Zoho-oauthtoken {token}"}
    
    try:
        res = requests.get(url, headers=headers)
        if res.status_code == 204 or not res.text.strip():
            return []
        
        res_data = res.json()
        attachments = []
        
        # V3 attachments key is "attachment"
        for att in res_data.get("attachment", []):
            size = att.get("size") or 0
            try:
                size_val = int(size)
                if size_val > 1024 * 1024:
                    size_formatted = f"{round(size_val / (1024 * 1024), 2)} MB"
                else:
                    size_formatted = f"{round(size_val / 1024, 2)} KB"
            except:
                size_formatted = "N/A"
                
            attachments.append({
                "id": str(att.get("attachment_id") or att.get("id")),
                "name": att.get("name"),
                "size_formatted": size_formatted,
                "url": att.get("permanent_url") or att.get("download_url") or att.get("preview_url") or "#"
            })
            
        return attachments
    except Exception as e:
        print(f"Error fetching attachments: {e}")
        return []

@app.get("/api/logs")
def get_logs():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM time_logs ORDER BY id DESC")
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return logs

@app.post("/api/logs")
async def create_log(request: Request):
    data = await request.json()
    task_id = data.get("task_id")
    task_name = data.get("task_name")
    project_id = data.get("project_id")
    project_name = data.get("project_name")
    user_email = data.get("user_email", "user@company.com")
    hours = float(data.get("hours", 0.0))
    billable = int(data.get("billable", True))
    rate = float(data.get("rate", 0.0))
    notes = data.get("notes", "")

    if not task_id or hours <= 0:
        raise HTTPException(status_code=400, detail="Invalid log data.")

    from datetime import datetime, timezone, timedelta
    ist_timezone = timezone(timedelta(hours=5, minutes=30))
    logged_at_ist = datetime.now(ist_timezone).strftime("%Y-%m-%d %H:%M:%S")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO time_logs (task_id, task_name, project_id, project_name, user_email, hours, billable, rate, notes, logged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (task_id, task_name, project_id, project_name, user_email, hours, billable, rate, notes, logged_at_ist))
    conn.commit()
    conn.close()
    
    return {"status": "success"}

@app.post("/api/logs/delete/{log_id}")
def delete_log(log_id: int):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM time_logs WHERE id = ? AND status = 'Pending'", (log_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

def get_display_name(email: str) -> str:
    email_lower = email.lower() if email else ""
    if "kaurgurjeet3010" in email_lower or "gurjeet" in email_lower:
        return "Gurjeet Kaur"
    if "vindhya" in email_lower:
        return "Vindhya Kesharwani"
    if "aashay" in email_lower:
        return "Aashay Soni"
    if "rahul" in email_lower:
        return "Rahul Patel"
        
    # Dynamic fallback to format any other email address
    clean_name = email_lower.split("@")[0].replace(".", " ").replace("-", " ").replace("_", " ")
    return " ".join(word.capitalize() for word in clean_name.split())

@app.post("/api/sync")
def sync_logs():
    is_mock = get_env_value("MOCK_MODE") == "True"
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, task_id, project_id, hours, user_email, notes, billable FROM time_logs WHERE status = 'Pending'")
    pending_logs = cursor.fetchall()
    
    if not pending_logs:
        conn.close()
        return {"synced_count": 0, "message": "No pending logs to sync."}
        
    synced_ids = []
    
    if is_mock:
        # Simulate syncing successfully
        for row in pending_logs:
            synced_ids.append(row[0])
    else:
        # Real Zoho Projects API Integration
        token = get_access_token()
        if not token:
             raise HTTPException(status_code=401, detail="Zoho not authorized or credentials invalid.")
             
        portal_id = get_portal_id(token)
        if not portal_id:
             raise HTTPException(status_code=400, detail="Unable to fetch Zoho Portal ID.")
             
        domain = get_zoho_domain()
        
        for row in pending_logs:
            log_id, task_id, project_id, hours, user_email, notes, billable = row
            
            # Format hours to HH:MM (e.g. 2.5 -> "02:30")
            h = int(hours)
            m = int((hours - h) * 60)
            hours_str = f"{h:02d}:{m:02d}"
            
            # Get current date in MM-dd-yyyy format (Zoho Projects standard)
            from datetime import datetime
            date_str = datetime.now().strftime("%m-%d-%Y")
            
            # Determine display name from logged email
            display_name = get_display_name(user_email)
            log_notes = f"[{display_name}] {notes}" if notes else f"[{display_name}] Logged via Dashboard"
            
            # Post time log to Zoho Projects task
            url = f"https://projectsapi.zoho.{domain}/restapi/portal/{portal_id}/projects/{project_id}/tasks/{task_id}/logs/"
            headers = {"Authorization": f"Zoho-oauthtoken {token}"}
            # Always billable
            payload = {
                "date": date_str,
                "hours": hours_str,
                "notes": log_notes,
                "bill_status": "Billable"
            }
            
            # Map Assigned User to Zoho Custom Field if configured in .env
            import json
            assigned_user_key = get_env_value("ZOHO_ASSIGNED_USER_FIELD_KEY")
            if assigned_user_key:
                payload["custom_fields"] = json.dumps({assigned_user_key: display_name})
            
            try:
                res = requests.post(url, data=payload, headers=headers)
                print(f"Sync Log response for log {log_id}: Status {res.status_code}, Body {res.text}")
                if res.status_code in [200, 201]:
                    synced_ids.append(log_id)
                else:
                    print(f"Error response from Zoho Projects: {res.text}")
            except Exception as e:
                print(f"Failed to sync log {log_id}: {str(e)}")

    if synced_ids:
        placeholders = ",".join("?" for _ in synced_ids)
        cursor.execute(f"UPDATE time_logs SET status = 'Synced' WHERE id IN ({placeholders})", synced_ids)
        conn.commit()
        
    conn.close()
    return {"synced_count": len(synced_ids), "message": f"Successfully synced {len(synced_ids)} logs to Zoho Projects."}

# --- OAuth Redirection endpoints ---

@app.get("/authorize")
def authorize_zoho():
    client_id = get_env_value("ZOHO_CLIENT_ID")
    redirect_uri = get_env_value("ZOHO_REDIRECT_URI")
    
    if not client_id:
        return HTMLResponse("<h3>Please configure ZOHO_CLIENT_ID in .env first!</h3>")
        
    # We request Projects API scope + Portals API scope + Timesheets write scope
    scope = "ZohoProjects.projects.READ,ZohoProjects.tasks.READ,ZohoProjects.portals.READ,ZohoProjects.timesheets.ALL"
    domain = get_zoho_domain()
    url = f"https://accounts.zoho.{domain}/oauth/v2/auth?scope={scope}&client_id={client_id}&response_type=code&redirect_uri={redirect_uri}&access_type=offline&prompt=consent"
    
    return RedirectResponse(url)

@app.get("/callback")
def oauth_callback(code: str = None, error: str = None):
    if error:
        return HTMLResponse(f"<h3>OAuth Error: {error}</h3>")
    if not code:
        return HTMLResponse("<h3>Authorization code missing.</h3>")
        
    client_id = get_env_value("ZOHO_CLIENT_ID")
    client_secret = get_env_value("ZOHO_CLIENT_SECRET")
    redirect_uri = get_env_value("ZOHO_REDIRECT_URI")
    
    # Exchange Auth Code for tokens
    domain = get_zoho_domain()
    url = f"https://accounts.zoho.{domain}/oauth/v2/token"
    params = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri
    }
    
    print("DEBUG OAUTH EXCHANGE:")
    print(f"client_id: {repr(client_id)}")
    print(f"client_secret: {repr(client_secret)}")
    print(f"redirect_uri: {repr(redirect_uri)}")
    print(f"code: {repr(code)}")
    print(f"url: {url}")
    
    try:
        response = requests.post(url, data=params)
        data = response.json()
        print(f"Response from Zoho: {data}")
        
        if "refresh_token" in data:
            update_env_file("ZOHO_REFRESH_TOKEN", data["refresh_token"])
            if "access_token" in data:
                access_token = data["access_token"]
                expires_in = data.get("expires_in", 3600)
                expires_at = time.time() + expires_in
                
                # Save to SQLite persistent store
                set_config_value("zoho_access_token", access_token)
                set_config_value("zoho_token_expires_at", str(expires_at))
            # Turn mock mode off as they successfully authorized
            update_env_file("MOCK_MODE", "False")
            
            return HTMLResponse("""
                <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
                    <h2 style="color: #2e7d32;">Authorization Successful!</h2>
                    <p>Zoho Projects has been successfully linked. Caching token and redirecting...</p>
                    <script>
                        setTimeout(function() {
                            window.location.href = '/';
                        }, 2000);
                    </script>
                </div>
            """)
        else:
            return HTMLResponse(f"<h3>Error exchanging tokens:</h3><pre>{data}</pre>")
    except Exception as e:
        return HTMLResponse(f"<h3>Server Error: {str(e)}</h3>")

# Serve Frontend static files
os.makedirs("static", exist_ok=True)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
