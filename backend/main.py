# backend/main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import traceback
import os
import uvicorn

from database import engine, Base, SessionLocal
from routers import (
    auth, users, warehouses, stocks, transactions,
    dashboard, brands, rice_types, mill_owners,
)


# ============================================================
# AUTO-MIGRATIONS
# Adds missing columns / tables WITHOUT destroying existing data.
# Safe to run on every startup (idempotent).
# ============================================================
def run_migrations():
    from sqlalchemy import text, inspect

    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./rice_warehouse.db")
    is_sqlite = "sqlite" in DATABASE_URL
    insp = inspect(engine)

    def col_exists(table: str, col: str) -> bool:
        try:
            return col in [c["name"] for c in insp.get_columns(table)]
        except Exception:
            return False

    def tbl_exists(table: str) -> bool:
        try:
            return table in insp.get_table_names()
        except Exception:
            return False

    def add_col(conn, table: str, col: str, ddl: str):
        if tbl_exists(table) and not col_exists(table, col):
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
                print(f"[MIGRATE] {table}.{col} added")
            except Exception as e:
                print(f"[MIGRATE-WARN] {table}.{col}: {e}")

    with engine.connect() as conn:
        # ---------------- USERS ----------------
        for col, ddl in [
            ("email",      "VARCHAR(255)"),
            ("phone_1",    "VARCHAR(15)"),
            ("phone_2",    "VARCHAR(15)"),
            ("otp_secret", "VARCHAR(32)"),
            ("updated_at", "DATETIME"),
        ]:
            add_col(conn, "users", col, ddl)

        # ---------------- WAREHOUSES ----------------
        for col, ddl in [
            ("location_name_ta", "VARCHAR(200)"),
            ("address",          "TEXT"),
            ("capacity",         "FLOAT DEFAULT 0.0"),
            ("is_active",        "BOOLEAN DEFAULT 1"),
        ]:
            add_col(conn, "warehouses", col, ddl)

        # ---------------- STOCKS  (major refactor → FK-based schema) ----------------
        for col, ddl in [
            ("brand_id",              "INTEGER"),
            ("rice_type_id",          "INTEGER"),
            ("warehouse_id",          "INTEGER"),
            ("brand_name",            "VARCHAR(100)"),
            ("brand_name_ta",         "VARCHAR(200)"),
            ("rice_type",             "VARCHAR(100)"),
            ("rice_type_ta",          "VARCHAR(200)"),
            ("production_company",    "VARCHAR(100)"),
            ("production_company_ta", "VARCHAR(200)"),
            ("bag_weight_kg",         "FLOAT DEFAULT 25.0"),
            ("total_bags",            "INTEGER DEFAULT 0"),
            ("total_weight_kg",       "FLOAT DEFAULT 0.0"),
            ("is_active",             "BOOLEAN DEFAULT 1"),
            ("created_at",            "DATETIME"),
            ("updated_at",            "DATETIME"),
        ]:
            add_col(conn, "stocks", col, ddl)

        # ---------------- TRANSACTIONS  (major refactor) ----------------
        for col, ddl in [
            ("transaction_type",   "VARCHAR(20)"),
            ("transaction_date",   "DATETIME"),
            ("vehicle_number",     "VARCHAR(20)"),
            ("driver_name",        "VARCHAR(100)"),
            ("driver_number",      "VARCHAR(20)"),
            ("source",             "VARCHAR(200)"),
            ("destination",        "VARCHAR(200)"),
            ("commission_partner", "VARCHAR(200)"),
            ("sub_source",         "VARCHAR(200)"),
            ("sub_destination",    "VARCHAR(200)"),
            ("total_bags",         "INTEGER DEFAULT 0"),
            ("total_weight_kg",    "FLOAT DEFAULT 0.0"),
            ("load_group_id",      "VARCHAR(50)"),
            ("notes",              "TEXT"),
            ("quality_grade",      "VARCHAR(20) DEFAULT 'standard'"),
            ("quality_note",       "VARCHAR(100)"),
            ("mill_owner_id",      "INTEGER"),
            ("mill_owner_name",    "VARCHAR(150)"),
            ("price",              "FLOAT"),
            ("rent",               "FLOAT"),
            ("hidden_charges",     "FLOAT"),
            ("location",           "VARCHAR(200)"),
            ("sell_price",         "FLOAT"),
            ("profit_loss",        "FLOAT"),
            ("approval_status",    "VARCHAR(20) DEFAULT 'pending'"),
            ("admin_pending",      "BOOLEAN DEFAULT 0"),
            ("created_by",         "INTEGER"),
            ("created_at",         "DATETIME"),
            ("completed_by",       "INTEGER"),
            ("completed_at",       "DATETIME"),
            ("updated_at",         "DATETIME"),
        ]:
            add_col(conn, "transactions", col, ddl)

        # ---------------- OTP LOGS ----------------
        for col, ddl in [
            ("email_used", "VARCHAR(255)"),
            ("is_used",    "BOOLEAN DEFAULT 0"),
            ("expires_at", "DATETIME"),
        ]:
            add_col(conn, "otp_logs", col, ddl)

        # ---------------- BRANDS ----------------
        for col, ddl in [
            ("name_ta",    "VARCHAR(200)"),
            ("is_active",  "BOOLEAN DEFAULT 1"),
            ("created_by", "INTEGER"),
        ]:
            add_col(conn, "brands", col, ddl)

        # ---------------- RICE TYPES ----------------
        for col, ddl in [
            ("brand_id",  "INTEGER"),
            ("name_ta",   "VARCHAR(200)"),
            ("is_active", "BOOLEAN DEFAULT 1"),
        ]:
            add_col(conn, "rice_types", col, ddl)

        # ---------------- MILL OWNERS ----------------
        for col, ddl in [
            ("contact_number", "VARCHAR(20)"),
            ("address",        "TEXT"),
            ("notes",          "TEXT"),
            ("is_active",      "BOOLEAN DEFAULT 1"),
            ("created_by",     "INTEGER"),
        ]:
            add_col(conn, "mill_owners", col, ddl)

        # ---------------- CUSTOM QUALITY GRADES (table) ----------------
        if not tbl_exists("custom_quality_grades"):
            pk = "INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "SERIAL PRIMARY KEY"
            ts = "DATETIME DEFAULT CURRENT_TIMESTAMP" if is_sqlite else "TIMESTAMPTZ DEFAULT NOW()"
            try:
                conn.execute(text(f"""
                    CREATE TABLE custom_quality_grades (
                        id {pk},
                        grade_name VARCHAR(100) UNIQUE NOT NULL,
                        created_at {ts}
                    )
                """))
                print("[MIGRATE] custom_quality_grades table created")
            except Exception as e:
                print(f"[MIGRATE-WARN] custom_quality_grades: {e}")

        conn.commit()

    print("[MIGRATE] All schema migrations completed.")


# ============================================================
# CREATE BASE SCHEMA + RUN MIGRATIONS
# Order matters:
#   1) create_all() → creates any brand-new tables (brands, rice_types,
#      mill_owners, transaction_items, transaction_item_weights,
#      transaction_item_splits, stock_weight_breakdowns, ...)
#   2) run_migrations() → patches columns onto pre-existing tables
# ============================================================
Base.metadata.create_all(bind=engine)
run_migrations()


# ============================================================
# DEFAULT ADMIN SEED
# ============================================================
def seed_default_admin():
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
            print(
                f"\n[STARTUP] Default admin created — "
                f"username: Admin | password: Admin@1234 | email: {default_email}\n"
            )
    finally:
        db.close()


seed_default_admin()


# ============================================================
# FASTAPI APP
# ============================================================
app = FastAPI(
    title="Rice Warehouse Management API",
    description="Multi-warehouse rice stock management system with Tamil/English support",
    version="3.0.0",
    redirect_slashes=False,
)

# ---- CORS (registered BEFORE routers) ----
_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ============================================================
# GLOBAL EXCEPTION HANDLER
# Ensures 500 responses still carry CORS headers, so the browser
# shows the REAL error message instead of a misleading
# "No 'Access-Control-Allow-Origin' header" message.
# Also prints the full traceback to the uvicorn console.
# ============================================================
@app.exception_handler(Exception)
async def catch_all_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()

    origin = request.headers.get("origin", "")
    headers: dict = {}
    if origin and (origin in _allowed_origins or origin.endswith(".vercel.app")):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Vary"] = "Origin"

    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal Server Error",
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "path": str(request.url.path),
        },
        headers=headers,
    )


# ============================================================
# ROUTERS
# ============================================================
app.include_router(auth.router,         prefix="/api/auth",         tags=["Authentication"])
app.include_router(users.router,        prefix="/api/users",        tags=["Users"])
app.include_router(warehouses.router,   prefix="/api/warehouses",   tags=["Warehouses"])
app.include_router(stocks.router,       prefix="/api/stocks",       tags=["Stocks"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(dashboard.router,    prefix="/api/dashboard",    tags=["Dashboard"])
app.include_router(brands.router,       prefix="/api/brands",       tags=["Brands"])
app.include_router(rice_types.router,   prefix="/api/rice-types",   tags=["Rice Types"])
app.include_router(mill_owners.router,  prefix="/api/mill-owners",  tags=["Mill Owners"])


# ============================================================
# HEALTH / ROOT
# ============================================================
@app.get("/")
def root():
    return {"message": "Rice Warehouse Management API v3", "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# ============================================================
# ENTRYPOINT
# ============================================================
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)