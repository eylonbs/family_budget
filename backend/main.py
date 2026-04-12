from __future__ import annotations

import os
import csv
import io
import hashlib
import secrets
from datetime import datetime, date
from typing import Optional, Dict

from fastapi import FastAPI, HTTPException, Query, Depends, Cookie, Response, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

import sys
sys.path.insert(0, os.path.dirname(__file__))
from database import get_db, init_db

load_dotenv()

app = FastAPI(title="Family Budget Tracker")

APP_PIN = os.environ.get("APP_PIN", "1234")
SESSION_SECRET = os.environ.get("SESSION_SECRET", secrets.token_hex(32))

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")


def make_session_token() -> str:
    raw = f"{APP_PIN}:{SESSION_SECRET}"
    return hashlib.sha256(raw.encode()).hexdigest()


def verify_session(session_token: Optional[str] = Cookie(None)):
    if session_token != make_session_token():
        raise HTTPException(status_code=401, detail="Not authenticated")


# ── Auth ──────────────────────────────────────────────────────────────────────

class PinRequest(BaseModel):
    pin: str


@app.post("/api/auth/login")
def login(body: PinRequest, response: Response):
    if body.pin != APP_PIN:
        raise HTTPException(status_code=401, detail="Wrong PIN")
    token = make_session_token()
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="strict",
        max_age=60 * 60 * 24 * 365,
    )
    return {"ok": True}


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("session_token")
    return {"ok": True}


@app.get("/api/auth/check")
def check_auth(session_token: Optional[str] = Cookie(None)):
    return {"authenticated": session_token == make_session_token()}


# ── Transaction models ────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    description: str
    amount: float = Field(gt=0)
    type: str = Field(pattern=r"^(income|expense)$")
    category: str
    paid_by: str = Field(pattern=r"^(Me|Wife|Both)$")
    date: str
    recurring: bool = False


class TransactionOut(BaseModel):
    id: int
    description: str
    amount: float
    type: str
    category: str
    paid_by: str
    date: str
    recurring: bool
    created_at: str


# ── Transactions CRUD ─────────────────────────────────────────────────────────

@app.get("/api/transactions")
def list_transactions(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    _=Depends(verify_session),
):
    conn = get_db()
    rows = conn.execute(
        """SELECT * FROM transactions
           WHERE strftime('%Y-%m', date) = ?
           ORDER BY date DESC, id DESC""",
        (month,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/transactions", status_code=201)
def create_transaction(tx: TransactionCreate, _=Depends(verify_session)):
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO transactions (description, amount, type, category, paid_by, date, recurring)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (tx.description, tx.amount, tx.type, tx.category, tx.paid_by, tx.date, int(tx.recurring)),
    )
    tx_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
    conn.close()
    return dict(row)


@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int, _=Depends(verify_session)):
    conn = get_db()
    cur = conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}


# ── Summary ───────────────────────────────────────────────────────────────────

@app.get("/api/summary")
def monthly_summary(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    _=Depends(verify_session),
):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM transactions WHERE strftime('%Y-%m', date) = ?",
        (month,),
    ).fetchall()

    income = sum(r["amount"] for r in rows if r["type"] == "income")
    expenses = sum(r["amount"] for r in rows if r["type"] == "expense")
    balance = income - expenses
    savings_rate = ((income - expenses) / income * 100) if income > 0 else 0

    me_spent = sum(r["amount"] for r in rows if r["type"] == "expense" and r["paid_by"] == "Me")
    wife_spent = sum(r["amount"] for r in rows if r["type"] == "expense" and r["paid_by"] == "Wife")

    cat_totals: Dict[str, float] = {}
    for r in rows:
        if r["type"] == "expense":
            cat_totals[r["category"]] = cat_totals.get(r["category"], 0) + r["amount"]

    income_count = sum(1 for r in rows if r["type"] == "income")
    expense_count = sum(1 for r in rows if r["type"] == "expense")

    conn.close()
    return {
        "income": income,
        "expenses": expenses,
        "balance": balance,
        "savings_rate": round(savings_rate, 1),
        "income_count": income_count,
        "expense_count": expense_count,
        "me_spent": me_spent,
        "wife_spent": wife_spent,
        "category_totals": cat_totals,
        "total_transactions": len(rows),
    }


@app.get("/api/summary/yearly")
def yearly_summary(
    year: int = Query(...),
    _=Depends(verify_session),
):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM transactions WHERE strftime('%Y', date) = ?",
        (str(year),),
    ).fetchall()

    monthly: Dict[str, Dict] = {}
    for r in rows:
        m = r["date"][:7]
        if m not in monthly:
            monthly[m] = {"income": 0, "expenses": 0}
        if r["type"] == "income":
            monthly[m]["income"] += r["amount"]
        else:
            monthly[m]["expenses"] += r["amount"]

    total_income = sum(v["income"] for v in monthly.values())
    total_expenses = sum(v["expenses"] for v in monthly.values())

    conn.close()
    return {
        "year": year,
        "total_income": total_income,
        "total_expenses": total_expenses,
        "balance": total_income - total_expenses,
        "monthly": monthly,
    }


# ── Budget Goals ──────────────────────────────────────────────────────────────

class BudgetGoalUpdate(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    monthly_budget: float = 0
    savings_target: float = 0
    category_limits: Dict[str, float] = {}


@app.get("/api/budget-goals")
def get_budget_goals(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    _=Depends(verify_session),
):
    conn = get_db()
    goal = conn.execute(
        "SELECT * FROM budget_goals WHERE month = ?", (month,)
    ).fetchone()
    limits = conn.execute(
        "SELECT category, limit_amount FROM category_limits WHERE month = ?", (month,)
    ).fetchall()
    conn.close()

    return {
        "month": month,
        "monthly_budget": goal["monthly_budget"] if goal else 0,
        "savings_target": goal["savings_target"] if goal else 0,
        "category_limits": {r["category"]: r["limit_amount"] for r in limits},
    }


@app.put("/api/budget-goals")
def update_budget_goals(body: BudgetGoalUpdate, _=Depends(verify_session)):
    conn = get_db()
    conn.execute(
        """INSERT INTO budget_goals (month, monthly_budget, savings_target)
           VALUES (?, ?, ?)
           ON CONFLICT(month) DO UPDATE SET monthly_budget=excluded.monthly_budget, savings_target=excluded.savings_target""",
        (body.month, body.monthly_budget, body.savings_target),
    )
    for cat, limit in body.category_limits.items():
        conn.execute(
            """INSERT INTO category_limits (month, category, limit_amount)
               VALUES (?, ?, ?)
               ON CONFLICT(month, category) DO UPDATE SET limit_amount=excluded.limit_amount""",
            (body.month, cat, limit),
        )
    conn.commit()
    conn.close()
    return {"ok": True}


# ── CSV Export ────────────────────────────────────────────────────────────────

@app.get("/api/export")
def export_csv(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    _=Depends(verify_session),
):
    conn = get_db()
    rows = conn.execute(
        """SELECT date, description, category, type, amount, paid_by, recurring
           FROM transactions
           WHERE strftime('%Y-%m', date) = ?
           ORDER BY date DESC""",
        (month,),
    ).fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Description", "Category", "Type", "Amount", "Person", "Recurring"])
    for r in rows:
        writer.writerow([r["date"], r["description"], r["category"], r["type"], r["amount"], r["paid_by"], "Yes" if r["recurring"] else "No"])

    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=budget_{month}.csv"},
    )


# ── Static files & SPA fallback ───────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/{full_path:path}")
def serve_frontend(full_path: str, request: Request):
    file_path = os.path.join(FRONTEND_DIR, full_path)
    if full_path and os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
