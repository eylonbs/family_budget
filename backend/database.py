import os
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL", "")


def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            description TEXT NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
            category TEXT NOT NULL,
            paid_by TEXT NOT NULL CHECK(paid_by IN ('Me', 'Wife', 'Both')),
            date TEXT NOT NULL,
            recurring BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS budget_goals (
            id SERIAL PRIMARY KEY,
            month TEXT NOT NULL UNIQUE,
            monthly_budget DOUBLE PRECISION NOT NULL DEFAULT 0,
            savings_target DOUBLE PRECISION NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS category_limits (
            id SERIAL PRIMARY KEY,
            month TEXT NOT NULL,
            category TEXT NOT NULL,
            limit_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
            UNIQUE(month, category)
        );

        CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
    """)
    conn.commit()
    cur.close()
    conn.close()
