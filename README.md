# Family Budget Tracker

A full-stack family budget tracker for couples to manage expenses and income together. Built with FastAPI + PostgreSQL + vanilla JS.

## Features

- **Dashboard** with KPIs: total income, expenses, balance, savings rate
- **Add transactions** categorized by type, assigned to Me/Wife/Both
- **Category budgets** with visual warnings at 80%/100%
- **Who spent more?** comparison between partners
- **Donut chart** showing spending breakdown by category
- **Search & filter** transactions by name, category, or type
- **CSV export** for any month
- **Dark mode** with persistence
- **PIN authentication** to keep data private
- **Persistent storage** with PostgreSQL (data survives restarts, never lost)

## Quick Start (Local)

1. **Install dependencies:**

```bash
cd money_saver
pip install -r backend/requirements.txt
```

2. **Set environment variables:**

```bash
export APP_PIN="your-secret-pin"
export DATABASE_URL="postgresql://user:password@localhost:5432/family_budget"
```

3. **Run the server:**

```bash
uvicorn backend.main:app --reload --port 8000
```

4. **Open** http://localhost:8000 and enter your PIN.

## Deploy to Render (Free)

1. Push this repo to GitHub.

2. Go to [render.com](https://render.com) and click **New** > **Blueprint**.

3. Connect your GitHub repo — Render will read `render.yaml` and create both the web service and PostgreSQL database automatically.

4. Set the `APP_PIN` environment variable in the Render dashboard to your desired PIN.

5. Deploy! Your app will be live at your Render URL.

> **Note:** Render free tier spins down after 15 minutes of inactivity. The first request after idle takes ~30 seconds. The app shows a loading indicator during this time. Your data is safe in PostgreSQL and is never lost.

## Project Structure

```
money_saver/
  backend/
    main.py              # FastAPI app with all API routes + auth
    database.py          # PostgreSQL setup and schema
    requirements.txt     # Python dependencies
  frontend/
    index.html           # Main app page
    style.css            # All styles
    app.js               # Frontend logic (API calls, UI rendering)
  render.yaml            # Render deployment config
  README.md              # This file
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with PIN |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/check` | Check auth status |
| GET | `/api/transactions?month=YYYY-MM` | List transactions |
| POST | `/api/transactions` | Add transaction |
| DELETE | `/api/transactions/:id` | Delete transaction |
| GET | `/api/summary?month=YYYY-MM` | Monthly summary/KPIs |
| GET | `/api/summary/yearly?year=YYYY` | Yearly summary |
| GET | `/api/budget-goals?month=YYYY-MM` | Get budget goals |
| PUT | `/api/budget-goals` | Update budget goals |
| GET | `/api/export?month=YYYY-MM` | Export CSV |

## Currency

All amounts are displayed in Israeli Shekels (ILS / ₪).
