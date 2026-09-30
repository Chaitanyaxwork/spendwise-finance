# SpendWise 💰

> **Your money. Your insights. Your future.**

SpendWise is a modern personal finance management web application built to help users track income and expenses, manage transactions, understand spending patterns, plan budgets and savings goals, and gain useful financial insights through interactive dashboards and analytics.

The project uses a lightweight vanilla JavaScript frontend with a Python Flask REST API backend and database integration, making it a practical full-stack application for personal finance management and portfolio demonstration.

## ✨ Features

* 🔐 **User Authentication** — Register, login, logout, and session management using JWT authentication.
* 💳 **Transaction Management** — Add, edit, delete, and organize income and expense transactions.
* 📊 **Financial Dashboard** — View income, expenses, savings, balances, and key financial summaries.
* 📈 **Advanced Analytics** — Monthly trends, spending patterns, recurring transactions, anomalies, forecasts, and financial-health metrics.
* 🎯 **Savings Goals** — Create and track financial goals with target amounts and target dates.
* 💰 **Budget Management** — Set monthly budgets and monitor budget utilization.
* 📁 **CSV Import** — Import transaction history from CSV files and automatically process transaction records.
* 💡 **Financial Insights** — Generate useful observations from transaction and spending data.
* 🔮 **Forecasting** — Analyze historical data and generate projected cumulative cash-flow trends.
* 🔁 **Recurring Transactions** — Identify recurring spending patterns from transaction history.
* ⚠️ **Anomaly Detection** — Highlight unusual transaction patterns for further review.
* 🧮 **Savings Simulator** — Experiment with savings scenarios and contribution assumptions.
* 📱 **Responsive UI** — Designed for desktop and smaller-screen devices.
* 🖥️ **Demo Mode** — The frontend can also run independently with browser-based demo data.

## 🛠️ Tech Stack

### Frontend

* HTML5
* CSS3
* Vanilla JavaScript
* Chart.js
* ES Modules
* Responsive UI

### Backend

* Python
* Flask
* Flask-SQLAlchemy
* Flask-JWT-Extended
* Flask-CORS
* Pandas
* Gunicorn

### Database

* SQLite for local development
* PostgreSQL-compatible deployment support

### Deployment

* **Frontend:** Vercel or another static hosting platform
* **Backend:** Render
* **Version Control:** Git & GitHub

## 📂 Project Structure

```text
spendwise_full/
│
├── frontend/
│   ├── assets/
│   ├── css/
│   ├── js/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── transactions.html
│   ├── analytics.html
│   ├── insights.html
│   ├── budgets.html
│   ├── goals.html
│   ├── simulator.html
│   └── settings.html
│
├── backend/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── tests/
│   ├── app.py
│   ├── config.py
│   ├── requirements.txt
│   └── render.yaml
│
├── app.config.ts
├── ideas.md
└── README.md
```

## 🚀 Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/spendwise-finance.git
cd spendwise-finance
```

### 2. Start the backend

```bash
cd backend

python3.13 -m venv .venv
source .venv/bin/activate
```

On Windows:

```bash
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create your environment file:

```bash
cp .env.example .env
```

Then configure the required environment variables in `.env`.

Start the Flask API:

```bash
python app.py
```

The backend runs locally on:

```text
http://localhost:5001
```

### 3. Start the frontend

Open a second terminal:

```bash
cd frontend
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000
```

Use the registration page to create a local account.

## 📥 Importing Transactions

SpendWise supports CSV-based transaction importing.

A basic CSV structure is:

```csv
date,description,category,type,amount
2026-09-01,Salary,Income,income,50000
2026-09-02,Groceries,Food,expense,1200
2026-09-04,Electricity Bill,Bills,expense,2500
```

For meaningful analytics, importing several months of transaction history provides more data for trends, recurring patterns, forecasting, and financial-health analysis.

## 🔌 API Overview

The frontend communicates with the Flask REST API through a centralized API service.

Main API areas include:

```text
/api/auth
/api/transactions
/api/import
/api/budgets
/api/goals
/api/insights
/api/analytics
```

Authentication requests use JWT bearer tokens.

## 📊 Analytics

SpendWise provides several analytical features based on transaction history:

* Monthly income and expense comparisons
* Spending trends
* Recurring transaction detection
* Anomaly identification
* Cash-flow forecasting
* Savings-rate analysis
* Expense-to-income analysis
* Budget utilization
* Savings consistency
* Emergency-fund tracking

Analytics are based on the user's available transaction history and are intended for informational and planning purposes.

## 🌐 Deployment

### Backend — Render

Deploy the `backend/` directory as a Python web service.

Configure the required environment variables, including:

```text
SECRET_KEY
JWT_SECRET_KEY
DATABASE_URL
CORS_ORIGINS
```

Use the provided `render.yaml` configuration as a starting point.

### Frontend — Vercel

Deploy the `frontend/` directory as a static site.

Configure:

```text
API_BASE_URL=https://your-api.onrender.com
```

The frontend build configuration uses this API URL to connect the deployed application to the Flask backend.

## 🔒 Security

Environment-specific secrets should be stored in environment variables and **must not be committed to GitHub**.

The repository includes example environment configuration files containing placeholder values for local setup.

Do not commit:

```text
.env
database files
private keys
API credentials
production secrets
```

## 🧪 Testing

Backend tests are located in:

```text
backend/tests/
```

Run the test suite with:

```bash
cd backend
pytest
```

## 🖼️ Screenshots

Add screenshots of the following pages to make the repository easier to understand:

* Landing page
* Dashboard
* Transactions
* Analytics
* Budgets
* Goals

Example:

```markdown
![SpendWise Dashboard](screenshots/dashboard.png)
```

## 🗺️ Future Improvements

Potential future improvements include:

* Support for additional bank-statement formats
* Improved automatic transaction categorization
* More advanced financial reports
* Additional visualization options
* Better recurring-payment detection
* Exportable financial reports
* Expanded mobile experience

## ⚠️ Disclaimer

SpendWise is a personal finance management and analytics project. Its calculations, forecasts, insights, and projections are intended for informational and educational purposes only and should not be considered professional financial advice.

## 📄 License

This project is licensed under the **MIT License**.


