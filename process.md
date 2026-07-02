# Task & Timesheet Dashboard Integration Process

Yeh document Zoho Projects aur Zoho People ke integration process aur dashboard flow ko describe karta hai.

---

## Step 1: Zoho Projects se Live Tasks Fetch Karna
* **Data Source:** Projects, tasks, assignments, aur statuses ka original record Zoho Projects me hi rahega.
* **No Local DB Copy:** Dashboard tasks ka alag database nahi banayega, balki directly Zoho Projects API se live fetch karega.
* **Refresh Rate:** Jab bhi user dashboard kholega ya manual/auto refresh trigger karega, live data fetch hoga.
* **OAuth Setup:** Zoho API Console se app register karke integration credentials (Client ID, Client Secret, Refresh Token) use kiye jayenge.
* **Caching (Recommended):** API rate limits se bachne ke liye 2-5 minutes ka temporary backend caching layer implement kiya jayega.

---

## Step 2: Apne Assigned Tasks Dekhna (Views)
* **Views Offered:** 
  * **Board View** (Kanban layout status-wise)
  * **List View** (Simple tabular/list format)
  * **Timeline View** (Gantt-like feel using task start/end dates)
* **Pipeline Stages:** Zoho Projects me set pipeline stages (To Do, In Progress, Review, Done) dynamic fetch hokar columns banenge.
* **User Mapping:** Dashboard user ke email address ya unique ID ko Zoho Projects User ID se map kiya jayega taaki assigned tasks hi dikhein.

---

## Step 3: Local Time Log Setup
* **Time Logging Options:**
  1. Live Timer (Start / Pause / Stop)
  2. Manual Start & End Time input
  3. Total Hours logging directly
* **Fields Captured:**
  * Task ID & Project ID (from Zoho Projects)
  * User/Employee Identifier
  * Logged Hours
  * Billable/Non-Billable flag
  * Billing Rate (if Billable)
* **Database Table:** Local DB me sirf `time_logs` ka schema store hoga.

---

## Step 4: Zoho People Sync (One-Way)
* **API Integration:** Zoho People ke Time Tracker API module ke sath link banaya jayega (Write-only access).
* **Scheduled Job:** Ek background cron job ya worker local database me logged hours ko time-to-time Zoho People me sync/push karega.
* **No Reverse Sync:** Data sirf Dashboard -> Zoho People flow karega.

---

## Step 5: Admin Reporting
* **Zero License Cost Extra:** Employee ko Zoho Projects ka separate license dene ki zaroorat nahi hai.
* **Admin View:** Admin Zoho People ke panel se complete time logs aur billable/non-billable summaries dekh sakte hain.

---

## Pending Items (Future Scope)
1. **Reminder System:** Agar employee time log bhool jata hai, toh auto-email ya dashboard notification send karna.
2. **Approval Workflow:** Manager ke approve karne ke baad hi time logs Zoho People me push hona.
3. **Weekly Admin Summary:** Auto-generated weekly billable vs non-billable reports admin ke liye.
4. **Locking Mechanism:** Submit/Sync hone ke baad entries lock ho jana aur change karne ke liye manager permission lagna.
