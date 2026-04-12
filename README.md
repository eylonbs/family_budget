# Family Budget Tracker

A full-stack family budget tracker for couples to manage expenses and income together. Built with FastAPI + SQLite + vanilla JS.

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
- **Persistent storage** with SQLite (data survives restarts)

## Quick Start (Local)

1. **Install dependencies:**

```bash
cd money_saver
pip install -r backend/requirements.txt
```

2. **Set your PIN** (optional, defaults to `1234`):

```bash
export APP_PIN="your-secret-pin"
```

3. **Run the server:**

```bash
uvicorn backend.main:app --reload --port 8000
```

4. **Open** http://localhost:8000 and enter your PIN.

## Deploy to Render (Free)

1. Push this repo to GitHub.

2. Go to [render.com](https://render.com) and create a new **Web Service**.

3. Connect your GitHub repo.

4. Render will detect `render.yaml` and configure everything automatically.

5. Set the `APP_PIN` environment variable in the Render dashboard to your desired PIN.

6. Deploy! Your app will be live at `https://family-budget-tracker.onrender.com`.

> **Note:** Render free tier spins down after 15 minutes of inactivity. The first request after idle takes ~30 seconds. This is normal for personal use.

## Project Structure

```
money_saver/
  backend/
    main.py              # FastAPI app with all API routes + auth
    database.py          # SQLite setup and schema
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
