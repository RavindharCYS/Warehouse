# backend/routers/brands.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List, Optional

from database import get_db
from models import Brand, RiceType, Stock, TransactionItem, User, UserRole
from schemas import BrandCreate, BrandUpdate, BrandOut
from utils.deps import get_current_user, require_admin

router = APIRouter()


# ============================================================
# LIST BRANDS
# ============================================================
@router.get("", response_model=List[BrandOut])
def list_brands(
    active_only: bool = True,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all brands. Default returns active brands only.
    Supports ?search=ponni for filtering by name.
    """
    q = db.query(Brand)
    if active_only:
        q = q.filter(Brand.is_active == True)  # noqa: E712
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(Brand.name.ilike(like), Brand.name_ta.ilike(like)))
    return q.order_by(Brand.name.asc()).all()


# ============================================================
# GET ONE BRAND
# ============================================================
@router.get("/{brand_id}", response_model=BrandOut)
def get_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


# ============================================================
# CREATE BRAND  (any authenticated user — needed for inline creation in Arrival form)
# ============================================================
@router.post("", response_model=BrandOut, status_code=status.HTTP_201_CREATED)
def create_brand(
    payload: BrandCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Brand name cannot be empty")

    # Case-insensitive duplicate check
    existing = db.query(Brand).filter(func.lower(Brand.name) == name.lower()).first()
    if existing:
        if existing.is_active:
            return existing  # idempotent — return existing instead of erroring
        # Reactivate if previously soft-deleted
        existing.is_active = True
        if payload.name_ta:
            existing.name_ta = payload.name_ta
        db.commit()
        db.refresh(existing)
        return existing

    brand = Brand(
        name=name,
        name_ta=(payload.name_ta or "").strip() or None,
        created_by=current_user.id,
        is_active=True,
    )
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


# ============================================================
# UPDATE BRAND  (admin only)
# ============================================================
@router.put("/{brand_id}", response_model=BrandOut)
def update_brand(
    brand_id: int,
    payload: BrandUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    data = payload.model_dump(exclude_none=True)

    # Duplicate name check (excluding self)
    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Brand name cannot be empty")
        dup = (
            db.query(Brand)
            .filter(func.lower(Brand.name) == new_name.lower(), Brand.id != brand_id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"Brand '{new_name}' already exists")
        data["name"] = new_name

    for field, value in data.items():
        setattr(brand, field, value)

    db.commit()
    db.refresh(brand)
    return brand


# ============================================================
# DELETE BRAND  (admin only — soft delete if used, hard delete if unused)
# ============================================================
@router.delete("/{brand_id}")
def delete_brand(
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Check if brand is referenced anywhere
    has_stock = db.query(Stock.id).filter(Stock.brand_id == brand_id).first() is not None
    has_tx_items = db.query(TransactionItem.id).filter(TransactionItem.brand_id == brand_id).first() is not None
    has_rice_types = db.query(RiceType.id).filter(RiceType.brand_id == brand_id).first() is not None

    if has_stock or has_tx_items or has_rice_types:
        # Soft delete to preserve historical data
        brand.is_active = False
        db.commit()
        return {"message": "Brand deactivated (in-use, soft delete)", "soft_delete": True}

    # Safe to hard delete
    db.delete(brand)
    db.commit()
    return {"message": "Brand deleted", "soft_delete": False}