"""
Migration script for V7 → V8 upgrade.
Run after deploying the new backend:
  python migrate.py

Safe to run multiple times.
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
PK = "INTEGER PRIMARY KEY AUTOINCREMENT" if is_sqlite else "SERIAL PRIMARY KEY"
TS = "DATETIME DEFAULT CURRENT_TIMESTAMP" if is_sqlite else "TIMESTAMPTZ DEFAULT NOW()"
BOOL_TRUE = "1" if is_sqlite else "TRUE"

insp = inspect(engine)
migrations = []


def col_exists(table, col):
    try:
        return col in [c["name"] for c in insp.get_columns(table)]
    except Exception:
        return False


def tbl_exists(table):
    return table in insp.get_table_names()


def add_column(conn, table, col, sql_type, default=None):
    if not tbl_exists(table) or col_exists(table, col):
        return False
    default_clause = f" DEFAULT {default}" if default is not None else ""
    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {sql_type}{default_clause}"))
    migrations.append(f"{table}.{col}")
    return True


def create_table(conn, name, sql):
    if tbl_exists(name):
        return False
    conn.execute(text(sql))
    migrations.append(f"{name} table")
    return True


with engine.connect() as conn:
    # ───────────── V6 → V7 legacy carry-overs ─────────────
    add_column(conn, "transactions", "sub_source", "VARCHAR(200)")
    add_column(conn, "transactions", "sub_destination", "VARCHAR(200)")
    add_column(conn, "stocks", "production_company_ta", "VARCHAR(200)")
    add_column(conn, "users", "email", "VARCHAR(255)")
    if tbl_exists("otp_logs"):
        add_column(conn, "otp_logs", "email_used", "VARCHAR(255)")

    create_table(conn, "custom_quality_grades", f"""
        CREATE TABLE custom_quality_grades (
            id {PK},
            grade_name VARCHAR(100) UNIQUE NOT NULL,
            created_at {TS}
        )
    """)

    # ───────────── V7 → V8 new master tables ─────────────
    create_table(conn, "brands", f"""
        CREATE TABLE brands (
            id {PK},
            name VARCHAR(100) UNIQUE NOT NULL,
            name_ta VARCHAR(200),
            is_active BOOLEAN DEFAULT {BOOL_TRUE},
            created_at {TS},
            created_by INTEGER REFERENCES users(id)
        )
    """)

    create_table(conn, "rice_types", f"""
        CREATE TABLE rice_types (
            id {PK},
            brand_id INTEGER REFERENCES brands(id),
            name VARCHAR(100) NOT NULL,
            name_ta VARCHAR(200),
            is_active BOOLEAN DEFAULT {BOOL_TRUE},
            created_at {TS}
        )
    """)

    create_table(conn, "mill_owners", f"""
        CREATE TABLE mill_owners (
            id {PK},
            name VARCHAR(150) UNIQUE NOT NULL,
            contact_number VARCHAR(20),
            address TEXT,
            notes TEXT,
            is_active BOOLEAN DEFAULT {BOOL_TRUE},
            created_at {TS},
            created_by INTEGER REFERENCES users(id)
        )
    """)

    create_table(conn, "transaction_items", f"""
        CREATE TABLE transaction_items (
            id {PK},
            transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
            brand_id INTEGER NOT NULL REFERENCES brands(id),
            rice_type_id INTEGER REFERENCES rice_types(id),
            bag_size_kg FLOAT DEFAULT 25.0,
            total_bags INTEGER DEFAULT 0,
            total_weight_kg FLOAT DEFAULT 0.0,
            warehouse_id INTEGER REFERENCES warehouses(id),
            notes TEXT
        )
    """)

    create_table(conn, "transaction_item_weights", f"""
        CREATE TABLE transaction_item_weights (
            id {PK},
            item_id INTEGER NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
            weight_kg FLOAT NOT NULL,
            quantity INTEGER NOT NULL
        )
    """)

    create_table(conn, "transaction_item_splits", f"""
        CREATE TABLE transaction_item_splits (
            id {PK},
            item_id INTEGER NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
            bags INTEGER NOT NULL DEFAULT 0,
            weight_kg FLOAT NOT NULL DEFAULT 0.0
        )
    """)

    create_table(conn, "stock_weight_breakdowns", f"""
        CREATE TABLE stock_weight_breakdowns (
            id {PK},
            stock_id INTEGER NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
            weight_kg FLOAT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 0
        )
    """)

    # ───────────── V7 → V8 new transaction columns ─────────────
    add_column(conn, "transactions", "driver_number", "VARCHAR(20)")
    add_column(conn, "transactions", "commission_partner", "VARCHAR(200)")
    add_column(conn, "transactions", "total_bags", "INTEGER", default="0")
    add_column(conn, "transactions", "total_weight_kg", "FLOAT", default="0.0")
    add_column(conn, "transactions", "load_group_id", "VARCHAR(50)")
    add_column(conn, "transactions", "mill_owner_id", "INTEGER")
    add_column(conn, "transactions", "mill_owner_name", "VARCHAR(150)")
    add_column(conn, "transactions", "price", "FLOAT")
    add_column(conn, "transactions", "rent", "FLOAT")
    add_column(conn, "transactions", "hidden_charges", "FLOAT")
    add_column(conn, "transactions", "location", "VARCHAR(200)")
    add_column(conn, "transactions", "sell_price", "FLOAT")
    add_column(conn, "transactions", "profit_loss", "FLOAT")
    add_column(conn, "transactions", "approval_status", "VARCHAR(20)", default="'pending'")
    add_column(conn, "transactions", "admin_pending", "BOOLEAN", default="0" if is_sqlite else "FALSE")
    add_column(conn, "transactions", "completed_by", "INTEGER")
    add_column(conn, "transactions", "completed_at", "DATETIME" if is_sqlite else "TIMESTAMPTZ")
    add_column(conn, "transactions", "quality_note", "VARCHAR(100)")

    # ───────────── V7 → V8 new stock columns ─────────────
    add_column(conn, "stocks", "brand_id", "INTEGER")
    add_column(conn, "stocks", "rice_type_id", "INTEGER")
    add_column(conn, "stocks", "warehouse_id", "INTEGER")
    add_column(conn, "stocks", "total_bags", "INTEGER", default="0")
    add_column(conn, "stocks", "total_weight_kg", "FLOAT", default="0.0")

    # ───────────── User extras ─────────────
    add_column(conn, "users", "phone_1", "VARCHAR(15)")
    add_column(conn, "users", "phone_2", "VARCHAR(15)")
    add_column(conn, "users", "otp_secret", "VARCHAR(32)")
    add_column(conn, "users", "updated_at", "DATETIME" if is_sqlite else "TIMESTAMPTZ")

    # ───────────── Indexes (SQLite-friendly) ─────────────
    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_txn_admin_pending ON transactions(admin_pending)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_txn_approval ON transactions(approval_status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_txn_load_group ON transactions(load_group_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_txn_vehicle ON transactions(vehicle_number)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ti_brand ON transaction_items(brand_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ti_warehouse ON transaction_items(warehouse_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tis_warehouse ON transaction_item_splits(warehouse_id)"))
    except Exception as e:
        print(f"[INDEX] non-fatal: {e}")

    # ───────────── Backfill: copy old quantity_* into new total_* ─────────────
    # Only runs once if old columns exist.
    try:
        if col_exists("transactions", "quantity_bags") and col_exists("transactions", "total_bags"):
            conn.execute(text("""
                UPDATE transactions
                SET total_bags = COALESCE(total_bags, 0) + COALESCE(quantity_bags, 0)
                WHERE (total_bags IS NULL OR total_bags = 0)
                  AND quantity_bags IS NOT NULL
            """))
            migrations.append("backfill total_bags ← quantity_bags")
        if col_exists("transactions", "quantity_kg") and col_exists("transactions", "total_weight_kg"):
            conn.execute(text("""
                UPDATE transactions
                SET total_weight_kg = COALESCE(total_weight_kg, 0) + COALESCE(quantity_kg, 0)
                WHERE (total_weight_kg IS NULL OR total_weight_kg = 0)
                  AND quantity_kg IS NOT NULL
            """))
            migrations.append("backfill total_weight_kg ← quantity_kg")
        # Map legacy mobile_number → driver_number
        if col_exists("transactions", "mobile_number") and col_exists("transactions", "driver_number"):
            conn.execute(text("""
                UPDATE transactions
                SET driver_number = mobile_number
                WHERE driver_number IS NULL AND mobile_number IS NOT NULL
            """))
            migrations.append("backfill driver_number ← mobile_number")
        # Map legacy sub_destination → commission_partner
        if col_exists("transactions", "sub_destination") and col_exists("transactions", "commission_partner"):
            conn.execute(text("""
                UPDATE transactions
                SET commission_partner = sub_destination
                WHERE commission_partner IS NULL AND sub_destination IS NOT NULL
            """))
            migrations.append("backfill commission_partner ← sub_destination")
    except Exception as e:
        print(f"[BACKFILL] non-fatal: {e}")

    # ───────────── Backfill: brands from existing stock.brand_name ─────────────
    try:
        if tbl_exists("brands") and col_exists("stocks", "brand_name"):
            existing_brands = {
                row[0].lower(): row[1]
                for row in conn.execute(text("SELECT name, id FROM brands")).fetchall()
            }
            unique_names = conn.execute(text("""
                SELECT DISTINCT brand_name, brand_name_ta
                FROM stocks
                WHERE brand_name IS NOT NULL AND brand_name != ''
            """)).fetchall()

            inserted = 0
            for name, name_ta in unique_names:
                if not name or name.lower() in existing_brands:
                    continue
                conn.execute(
                    text("INSERT INTO brands (name, name_ta, is_active) VALUES (:n, :nt, :a)"),
                    {"n": name, "nt": name_ta, "a": True},
                )
                inserted += 1
            if inserted:
                migrations.append(f"backfill {inserted} brands from stocks.brand_name")

            # Now map stocks.brand_id from brand_name
            if col_exists("stocks", "brand_id"):
                conn.execute(text("""
                    UPDATE stocks
                    SET brand_id = (
                        SELECT id FROM brands
                        WHERE LOWER(brands.name) = LOWER(stocks.brand_name)
                        LIMIT 1
                    )
                    WHERE brand_id IS NULL AND brand_name IS NOT NULL
                """))
                migrations.append("backfill stocks.brand_id from brand_name")
    except Exception as e:
        print(f"[BRAND BACKFILL] non-fatal: {e}")

    conn.commit()


print("=" * 60)
if migrations:
    print("✅ Migrations applied:")
    for m in migrations:
        print(f"   • {m}")
else:
    print("✅ Already up to date — no migrations needed.")
print("=" * 60)