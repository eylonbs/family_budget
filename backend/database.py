import os
from urllib.parse import quote_plus
import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Render gives postgres:// but psycopg2 requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

DB_HOST = os.environ.get("DB_HOST", "")
DB_PORT = os.environ.get("DB_PORT", "6543")
DB_NAME = os.environ.get("DB_NAME", "postgres")
DB_USER = os.environ.get("DB_USER", "postgres")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")


def get_db():
    if DB_HOST:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=int(DB_PORT),
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            connect_timeout=10,
            options="-c search_path=public",
        )
    else:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
    conn.autocommit = False
    return conn


def init_db():
    conn = get_db()
    try:
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                description TEXT NOT NULL,
                amount DOUBLE PRECISION NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
                category TEXT NOT NULL,
                paid_by TEXT NOT NULL,
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

        # Drop old paid_by constraint if it exists from a previous schema
        cur.execute("ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_paid_by_check")
        conn.commit()
        cur.close()
    finally:
        conn.close()
