"""
Migration: Add buying_price and selling_price columns to transaction_items table.
Run once: python migrate_item_prices.py
"""
import os
import sys
import logging
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./rice_warehouse.db")
if "railway.internal" in DATABASE_URL:
    DATABASE_URL = "sqlite:///./rice_warehouse.db"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)

def column_exists(conn, table, column):
    if DATABASE_URL.startswith("sqlite"):
        result = conn.execute(text(f"PRAGMA table_info({table})"))
        return any(row[1] == column for row in result)
    else:
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            f"WHERE table_name='{table}' AND column_name='{column}'"
        ))
        return result.fetchone() is not None

with engine.connect() as conn:
    if not column_exists(conn, "transaction_items", "buying_price"):
        conn.execute(text("ALTER TABLE transaction_items ADD COLUMN buying_price FLOAT"))
        logger.info("Added buying_price to transaction_items")
    else:
        logger.info("buying_price already exists")

    if not column_exists(conn, "transaction_items", "selling_price"):
        conn.execute(text("ALTER TABLE transaction_items ADD COLUMN selling_price FLOAT"))
        logger.info("Added selling_price to transaction_items")
    else:
        logger.info("selling_price already exists")

    if not column_exists(conn, "transaction_item_weights", "buying_price"):
        conn.execute(text("ALTER TABLE transaction_item_weights ADD COLUMN buying_price FLOAT"))
        logger.info("Added buying_price to transaction_item_weights")
    else:
        logger.info("transaction_item_weights.buying_price already exists")

    conn.commit()

logger.info("Migration complete.")