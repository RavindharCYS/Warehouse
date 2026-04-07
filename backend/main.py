from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from database import engine, Base, SessionLocal
from routers import auth, users, warehouses, stocks, transactions, dashboard


def run_migrations():
    """Auto-migrate new columns/tables without destroying existing data."""
    from sqlalchemy import text, inspect
    import os

    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./rice_warehouse.db")
    is_sqlite = "sqlite" in DATABASE_URL
    insp = inspect(engine)

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
            print("[MIGRATE] transactions.sub_source added")

        if not col_exists("transactions", "sub_destination"):
            conn.execute(text("ALTER TABLE transactions ADD COLUMN sub_destination VARCHAR(200)"))
            print("[MIGRATE] transactions.sub_destination added")

        if not col_exists("stocks", "production_company_ta"):
            conn.execute(text("ALTER TABLE stocks ADD COLUMN production_company_ta VARCHAR(200)"))
            print("[MIGRATE] stocks.production_company_ta added")

        if not col_exists("users", "email"):
            conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(255)"))
            print("[MIGRATE] users.email added")

        if tbl_exists("otp_logs") and not col_exists("otp_logs", "email_used"):
            conn.execute(text("ALTER TABLE otp_logs ADD COLUMN email_used VARCHAR(255)"))
            print("[MIGRATE] otp_logs.email_used added")

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
            print("[MIGRATE] custom_quality_grades table created")

        conn.commit()


Base.metadata.create_all(bind=engine)
run_migrations()


def seed_default_admin():
    """Create default admin account if none exists."""
    import os
    from models import User, UserRole
    from utils.security import hash_password
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.role == UserRole.admin).first()
        if not existing:
            default_email = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@ricewarehouse.local")
            admin = User(
                username="Admin",
                full_name="Warehouse Admin",
                password_hash=hash_password("Admin@1234"),
                role=UserRole.admin,
                email=default_email,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"\n[STARTUP] Default admin created — username: Admin | password: Admin@1234 | email: {default_email}\n")
    finally:
        db.close()


seed_default_admin()

# ✅ FIXED: Added redirect_slashes=False to prevent 307 redirects dropping auth headers
app = FastAPI(
    title="Rice Warehouse Management API",
    description="Multi-warehouse rice stock management system with Tamil/English support",
    version="3.0.0",
    redirect_slashes=False
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,         prefix="/api/auth",         tags=["Authentication"])
app.include_router(users.router,        prefix="/api/users",        tags=["Users"])
app.include_router(warehouses.router,   prefix="/api/warehouses",   tags=["Warehouses"])
app.include_router(stocks.router,       prefix="/api/stocks",       tags=["Stocks"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(dashboard.router,    prefix="/api/dashboard",    tags=["Dashboard"])

@app.get("/")
def root():
    return {"message": "Rice Warehouse Management API v3", "status": "running"}

@app.get("/health")
def health():
    return {"status": "healthy"}
