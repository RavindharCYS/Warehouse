# routers/admin.py
"""
Admin-only data management endpoints:
  GET  /api/admin/backup      → full JSON backup of all data
  POST /api/admin/restore     → restore from a backup JSON
  DELETE /api/admin/delete-all → wipe all transactional + master data
                                 (keeps users + warehouses intact)
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Any
import datetime

from database import get_db, IS_SQLITE
from models import (
    User, UserRole,
    Warehouse, Brand, RiceType, MillOwner,
    Stock, StockWeightBreakdown,
    Transaction, TransactionItem, TransactionItemWeight,
    TransactionItemSplit, CustomQualityGrade,
)
from utils.deps import get_current_user

router = APIRouter()


def _ensure_admin(user: User):
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")


def _row_to_dict(obj) -> dict:
    """Convert a SQLAlchemy model instance to a plain dict."""
    d = {}
    for col in obj.__table__.columns:
        val = getattr(obj, col.name)
        if isinstance(val, datetime.datetime):
            val = val.isoformat()
        elif isinstance(val, datetime.date):
            val = val.isoformat()
        d[col.name] = val
    return d


# ============================================================
# BACKUP
# ============================================================
@router.get("/backup")
def full_backup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    def dump(model):
        return [_row_to_dict(r) for r in db.query(model).all()]

    backup = {
        "version": 1,
        "created_at": datetime.datetime.utcnow().isoformat(),
        "created_by": current_user.username,
        "data": {
            "users":                    dump(User),
            "warehouses":               dump(Warehouse),
            "brands":                   dump(Brand),
            "rice_types":               dump(RiceType),
            "mill_owners":              dump(MillOwner),
            "stocks":                   dump(Stock),
            "stock_weight_breakdowns":  dump(StockWeightBreakdown),
            "transactions":             dump(Transaction),
            "transaction_items":        dump(TransactionItem),
            "transaction_item_weights": dump(TransactionItemWeight),
            "transaction_item_splits":  dump(TransactionItemSplit),
            "custom_quality_grades":    dump(CustomQualityGrade),
        },
    }

    return JSONResponse(content=backup)


# ============================================================
# DELETE ALL  (wipe transactional + master data; keep users)
# ============================================================
@router.delete("/delete-all")
def delete_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    # Order matters — child tables first to respect FKs
    tables_to_clear = [
        "stock_weight_breakdowns",
        "transaction_item_splits",
        "transaction_item_weights",
        "transaction_items",
        "transactions",
        "stocks",
        "custom_quality_grades",
        "mill_owners",
        "rice_types",
        "brands",
    ]
    # warehouses and users are intentionally kept

    if IS_SQLITE:
        db.execute(text("PRAGMA foreign_keys=OFF"))

    counts = {}
    for tbl in tables_to_clear:
        try:
            result = db.execute(text(f"DELETE FROM {tbl}"))
            counts[tbl] = result.rowcount
        except Exception as e:
            counts[tbl] = f"error: {e}"

    if IS_SQLITE:
        db.execute(text("PRAGMA foreign_keys=ON"))

    db.commit()

    return {
        "success": True,
        "message": "All transactional and master data deleted. Users and warehouses are kept.",
        "deleted_rows": counts,
    }


# ============================================================
# RESTORE  (import a full backup)
# ============================================================
@router.post("/restore")
async def restore_backup(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    if payload.get("version") != 1:
        raise HTTPException(status_code=400, detail="Unsupported backup version")

    data: dict[str, list] = payload.get("data", {})

    # ── 1. Wipe existing data (same order as delete-all) ──────────────────
    tables_to_clear = [
        "stock_weight_breakdowns",
        "transaction_item_splits",
        "transaction_item_weights",
        "transaction_items",
        "transactions",
        "stocks",
        "custom_quality_grades",
        "mill_owners",
        "rice_types",
        "brands",
        "warehouses",
        # users last — we want to restore them too
        "users",
    ]

    if IS_SQLITE:
        db.execute(text("PRAGMA foreign_keys=OFF"))

    for tbl in tables_to_clear:
        try:
            db.execute(text(f"DELETE FROM {tbl}"))
        except Exception:
            pass

    db.commit()

    # ── 2. Re-insert in dependency order ─────────────────────────────────
    insert_order = [
        ("users",                    User),
        ("warehouses",               Warehouse),
        ("brands",                   Brand),
        ("rice_types",               RiceType),
        ("mill_owners",              MillOwner),
        ("stocks",                   Stock),
        ("stock_weight_breakdowns",  StockWeightBreakdown),
        ("transactions",             Transaction),
        ("transaction_items",        TransactionItem),
        ("transaction_item_weights", TransactionItemWeight),
        ("transaction_item_splits",  TransactionItemSplit),
        ("custom_quality_grades",    CustomQualityGrade),
    ]

    restored = {}
    for key, Model in insert_order:
        rows = data.get(key, [])
        count = 0
        for row in rows:
            # Build a dict of only columns that exist on the model
            col_names = {c.name for c in Model.__table__.columns}
            clean = {k: v for k, v in row.items() if k in col_names}

            # Parse datetime strings back to datetime objects
            for col in Model.__table__.columns:
                val = clean.get(col.name)
                if val is not None and str(col.type) in ("DATETIME", "TIMESTAMP"):
                    try:
                        clean[col.name] = datetime.datetime.fromisoformat(val)
                    except Exception:
                        pass

            try:
                db.add(Model(**clean))
                count += 1
            except Exception as e:
                # Skip rows that violate constraints (e.g. duplicate unique keys)
                db.rollback()
                continue

        try:
            db.flush()
        except Exception:
            db.rollback()

        restored[key] = count

    if IS_SQLITE:
        db.execute(text("PRAGMA foreign_keys=ON"))

    db.commit()

    # Reset SQLite auto-increment sequences to avoid PK collisions after restore
    if IS_SQLITE:
        with db.bind.connect() as conn:
            for key, Model in insert_order:
                tbl = Model.__tablename__
                try:
                    res = conn.execute(text(f"SELECT MAX(id) FROM {tbl}")).scalar()
                    if res is not None:
                        conn.execute(
                            text(f"UPDATE sqlite_sequence SET seq = :seq WHERE name = :name"),
                            {"seq": res, "name": tbl},
                        )
                except Exception:
                    pass
            conn.commit()

    return {
        "success": True,
        "message": "Backup restored successfully.",
        "restored_rows": restored,
    }