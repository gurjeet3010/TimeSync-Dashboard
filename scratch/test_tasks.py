import os
import requests
from dotenv import load_dotenv

load_dotenv()

token = os.getenv("ZOHO_ACCESS_TOKEN")
domain = os.getenv("ZOHO_DOMAIN") or "com"

# Fetch portal id
url_portal = f"https://projectsapi.zoho.{domain}/restapi/portals/"
headers = {"Authorization": f"Zoho-oauthtoken {token}"}

res_portal = requests.get(url_portal, headers=headers)
print("Portal Response Status:", res_portal.status_code)
portals = res_portal.json().get("portals", [])
if not portals:
    print("No portals found")
    exit()

portal_id = portals[0]["id"]
print("Portal ID:", portal_id)

# Fetch projects
url_projects = f"https://projectsapi.zoho.{domain}/restapi/portal/{portal_id}/projects/"
res_projects = requests.get(url_projects, headers=headers)
print("Projects Response Status:", res_projects.status_code)
projects_data = res_projects.json()
print("Projects JSON Keys:", projects_data.keys())
projects = projects_data.get("projects", [])
if not projects:
    print("No projects found")
    exit()

for p in projects:
    print(f"Project ID: {p['id']}, Name: {p['name']}")

# Fetch tasks for first project
project_id = projects[0]["id"]
url_tasks = f"https://projectsapi.zoho.{domain}/restapi/portal/{portal_id}/projects/{project_id}/tasks/"
res_tasks = requests.get(url_tasks, headers=headers)
print("Tasks Response Status:", res_tasks.status_code)
if res_tasks.status_code == 200:
    tasks_data = res_tasks.json()
    print("Tasks Keys:", tasks_data.keys())
    tasks = tasks_data.get("tasks", [])
    print(f"Number of tasks: {len(tasks)}")
    if tasks:
        print("First task structure:", tasks[0])
else:
    print("Failed to fetch tasks, raw text:", res_tasks.text)
