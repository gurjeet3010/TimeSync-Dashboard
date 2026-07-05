# ⏱️ TimeSync Dashboard

TimeSync Dashboard is a web application built to simplify employee time tracking by integrating with the **Zoho Projects API**. Instead of navigating through multiple Zoho pages, the dashboard provides a single place to view timesheets, time logs, and project-related work in a clean and organized interface.

The goal of this project was to create a faster and more intuitive way to monitor work hours while learning API integration, backend development, and dashboard design.

---

## ✨ Features

- Connects with Zoho Projects using APIs
- Displays employee time logs and timesheets
- Project-wise and user-wise filtering
- Real-time synchronization of data
- Clean and responsive dashboard
- Backend handling for API communication and data processing

---

## 🛠️ Built With

- **Python**
- **FastAPI**
- **HTML**
- **CSS**
- **JavaScript**
- **SQLite**
- **Zoho Projects API**

---

## 📸 About the Project

While working with Zoho Projects, I realized that accessing timesheet information often involved navigating through multiple screens. This project was built to make that process simpler by collecting the required data through APIs and presenting it in a single dashboard.

Apart from displaying data, the project also helped me understand:

- REST API integration
- Authentication using OAuth
- Backend data processing
- Handling API responses
- Dashboard development
- Error handling and debugging

---

## 🚀 Getting Started

Clone the repository

```bash
git clone https://github.com/gurjeet3010/TimeSync-Dashboard.git
```

Move into the project

```bash
cd TimeSync-Dashboard
```

Create a virtual environment

```bash
python -m venv venv
```

Activate it

Windows

```bash
venv\Scripts\activate
```

Install dependencies

```bash
pip install -r requirements.txt
```

Create a `.env` file and add your Zoho credentials.

Example:

```env
CLIENT_ID=
CLIENT_SECRET=
REFRESH_TOKEN=
PORTAL_ID=
```

Run the application

```bash
uvicorn main:app --reload
```

Open your browser and visit

```
http://127.0.0.1:8000
```

---

## 📂 Project Structure

```
TimeSync-Dashboard
│
├── static/
├── templates/
├── main.py
├── requirements.txt
├── .env.example
└── README.md
```

---

## 📈 Future Improvements

Some features I plan to add in the future:

- Export reports to Excel
- Interactive charts and graphs
- User authentication
- Better filtering options
- Performance analytics
- Dark mode

---

## 📚 What I Learned

This project gave me practical experience with:

- Working with third-party APIs
- Building backend services using FastAPI
- Processing and displaying real-world data
- Managing environment variables securely
- Debugging API responses
- Version control using Git and GitHub

---

## 🤝 Contributing

Suggestions and improvements are always welcome.

If you have an idea that can improve the project, feel free to fork the repository and open a pull request.

---

## 👩‍💻 Author

**Gurjeet Kaur**

GitHub: https://github.com/gurjeet3010

LinkedIn: https://www.linkedin.com/in/gurjeet-kaur3010

---

If you found this project interesting, consider giving it a ⭐.
