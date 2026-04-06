"""
Migration script for V6 → V7 upgrade.
Run once after deploying the new backend:
  python migrate.py

Safe to run multiple times (checks before altering).
Works with both SQLite and PostgreSQL.
"""
import os
from sqlalchemy import create_engine, text, inspect

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./rice_warehouse.db")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

is_sqlite = "sqlite" in DATABASE_URL
insp = inspect(engine)
migrations = []

def col_exists(table, col):
    try:
        return col in [c["name"] for c in insp.get_columns(table)]
    except Exception:
        return False

def tbl_exists(table):
    return table in insp.get_table_names()

with engine.connect() as conn:
    if not col_exists("transactions", "sub_source"):
        conn.execute(text("ALTER TABLE transactions ADD COLUMN sub_source VARCHAR(200)"))
        migrations.append("transactions.sub_source")

    if not col_exists("transactions", "sub_destination"):
        conn.execute(text("ALTER TABLE transactions ADD COLUMN sub_destination VARCHAR(200)"))
        migrations.append("transactions.sub_destination")

    if not col_exists("stocks", "production_company_ta"):
        conn.execute(text("ALTER TABLE stocks ADD COLUMN production_company_ta VARCHAR(200)"))
        migrations.append("stocks.production_company_ta")

    if not tbl_exists("custom_quality_grades"):
        pk = "INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "SERIAL PRIMARY KEY"
        ts = "DATETIME DEFAULT CURRENT_TIMESTAMP" if is_sqlite else "TIMESTAMPTZ DEFAULT NOW()"
        conn.execute(text(f"""
            CREATE TABLE custom_quality_grades (
                id {pk},
                grade_name VARCHAR(100) UNIQUE NOT NULL,
                created_at {ts}
            )
        """))
        migrations.append("custom_quality_grades table")

    conn.commit()

if migrations:
    print("✅ Migrations applied:")
    for m in migrations:
        print(f"   • {m}")
else:
    print("✅ Already up to date — no migrations needed.")
