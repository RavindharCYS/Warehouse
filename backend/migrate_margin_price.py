"""
Migration: Add margin_price column to transactions and transaction_items tables.

Run once:
    python migrate_margin_price.py

Safe to run multiple times — skips columns that already exist.
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "rice_warehouse.db")


def column_exists(cursor, table: str, column: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    migrations = [
        ("transactions",      "margin_price", "ALTER TABLE transactions ADD COLUMN margin_price FLOAT"),
        ("transaction_items", "margin_price", "ALTER TABLE transaction_items ADD COLUMN margin_price FLOAT"),
    ]

    for table, col, sql in migrations:
        if column_exists(cur, table, col):
            print(f"[skip] {table}.{col} already exists")
        else:
            cur.execute(sql)
            print(f"[ok]   Added {table}.{col}")

    conn.commit()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    run()
