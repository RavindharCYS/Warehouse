# backend/routers/mill_owners.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import List, Optional

from database import get_db
from models import MillOwner, Transaction, User
from schemas import MillOwnerCreate, MillOwnerUpdate, MillOwnerOut
from utils.deps import require_admin

router = APIRouter()


# ============================================================
# LIST MILL OWNERS  (admin only — entire CRUD is admin-gated)
# ============================================================
@router.get("", response_model=List[MillOwnerOut])
def list_mill_owners(
    active_only: bool = True,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    q = db.query(MillOwner)
    if active_only:
        q = q.filter(MillOwner.is_active == True)  # noqa: E712
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(
            MillOwner.name.ilike(like),
            MillOwner.contact_number.ilike(like),
        ))
    return q.order_by(MillOwner.name.asc()).all()


# ============================================================
# GET ONE MILL OWNER
# ============================================================
@router.get("/{mill_owner_id}", response_model=MillOwnerOut)
def get_mill_owner(
    mill_owner_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    mo = db.query(MillOwner).filter(MillOwner.id == mill_owner_id).first()
    if not mo:
        raise HTTPException(status_code=404, detail="Mill owner not found")
    return mo


# ============================================================
# CREATE MILL OWNER
# ============================================================
@router.post("", response_model=MillOwnerOut, status_code=status.HTTP_201_CREATED)
def create_mill_owner(
    payload: MillOwnerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Mill owner name cannot be empty")

    existing = db.query(MillOwner).filter(func.lower(MillOwner.name) == name.lower()).first()
    if existing:
        if existing.is_active:
            raise HTTPException(status_code=400, detail=f"Mill owner '{name}' already exists")
        # Reactivate
        existing.is_active = True
        if payload.contact_number:
            existing.contact_number = payload.contact_number
        if payload.address:
            existing.address = payload.address
        if payload.notes:
            existing.notes = payload.notes
        db.commit()
        db.refresh(existing)
        return existing

    mo = MillOwner(
        name=name,
        contact_number=(payload.contact_number or "").strip() or None,
        address=(payload.address or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
        created_by=current_user.id,
        is_active=True,
    )
    db.add(mo)
    db.commit()
    db.refresh(mo)
    return mo


# ============================================================
# UPDATE MILL OWNER
# ============================================================
@router.put("/{mill_owner_id}", response_model=MillOwnerOut)
def update_mill_owner(
    mill_owner_id: int,
    payload: MillOwnerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    mo = db.query(MillOwner).filter(MillOwner.id == mill_owner_id).first()
    if not mo:
        raise HTTPException(status_code=404, detail="Mill owner not found")

    data = payload.model_dump(exclude_none=True)

    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        dup = (
            db.query(MillOwner)
            .filter(func.lower(MillOwner.name) == new_name.lower(), MillOwner.id != mill_owner_id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"Mill owner '{new_name}' already exists")
        data["name"] = new_name

    for field, value in data.items():
        setattr(mo, field, value)

    db.commit()
    db.refresh(mo)
    return mo


# ============================================================
# DELETE MILL OWNER  (soft if used in transactions)
# ============================================================
@router.delete("/{mill_owner_id}")
def delete_mill_owner(
    mill_owner_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    mo = db.query(MillOwner).filter(MillOwner.id == mill_owner_id).first()
    if not mo:
        raise HTTPException(status_code=404, detail="Mill owner not found")

    # Soft delete if referenced in transactions
    in_use = db.query(Transaction.id).filter(Transaction.mill_owner_id == mill_owner_id).first() is not None
    if in_use:
        mo.is_active = False
        db.commit()
        return {"message": "Mill owner deactivated (in-use, soft delete)", "soft_delete": True}

    db.delete(mo)
    db.commit()
    return {"message": "Mill owner deleted", "soft_delete": False}


# ============================================================
# STATS  (transactions per mill owner — handy for admin reports)
# ============================================================
@router.get("/{mill_owner_id}/stats")
def mill_owner_stats(
    mill_owner_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    mo = db.query(MillOwner).filter(MillOwner.id == mill_owner_id).first()
    if not mo:
        raise HTTPException(status_code=404, detail="Mill owner not found")

    total_txs = db.query(func.count(Transaction.id)).filter(Transaction.mill_owner_id == mill_owner_id).scalar() or 0
    total_bags = db.query(func.sum(Transaction.total_bags)).filter(Transaction.mill_owner_id == mill_owner_id).scalar() or 0
    total_kg = db.query(func.sum(Transaction.total_weight_kg)).filter(Transaction.mill_owner_id == mill_owner_id).scalar() or 0
    total_price = db.query(func.sum(Transaction.price)).filter(Transaction.mill_owner_id == mill_owner_id).scalar() or 0

    last_tx = (
        db.query(Transaction)
        .filter(Transaction.mill_owner_id == mill_owner_id)
        .order_by(Transaction.transaction_date.desc())
        .first()
    )

    return {
        "mill_owner_id": mill_owner_id,
        "name": mo.name,
        "total_transactions": int(total_txs),
        "total_bags": int(total_bags),
        "total_weight_kg": float(total_kg),
        "total_amount": float(total_price),
        "last_transaction_date": last_tx.transaction_date if last_tx else None,
    }