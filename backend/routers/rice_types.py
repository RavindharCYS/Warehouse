# backend/routers/rice_types.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List, Optional

from database import get_db
from models import RiceType, Brand, Stock, TransactionItem, User
from schemas import RiceTypeCreate, RiceTypeUpdate, RiceTypeOut
from utils.deps import get_current_user, require_admin

router = APIRouter()


# ============================================================
# LIST RICE TYPES
# ============================================================
@router.get("", response_model=List[RiceTypeOut])
def list_rice_types(
    brand_id: Optional[int] = None,
    active_only: bool = True,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List rice types. Optionally filter by brand_id.
    Rice types with brand_id=NULL are 'global' (apply to any brand).
    """
    q = db.query(RiceType)
    if active_only:
        q = q.filter(RiceType.is_active == True)  # noqa: E712

    if brand_id is not None:
        # Return brand-specific + global rice types
        q = q.filter(or_(RiceType.brand_id == brand_id, RiceType.brand_id.is_(None)))

    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(RiceType.name.ilike(like), RiceType.name_ta.ilike(like)))

    return q.order_by(RiceType.name.asc()).all()


# ============================================================
# GET ONE RICE TYPE
# ============================================================
@router.get("/{rice_type_id}", response_model=RiceTypeOut)
def get_rice_type(
    rice_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rt = db.query(RiceType).filter(RiceType.id == rice_type_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Rice type not found")
    return rt


# ============================================================
# CREATE RICE TYPE  (any user — for inline creation in Arrival)
# ============================================================
@router.post("", response_model=RiceTypeOut, status_code=status.HTTP_201_CREATED)
def create_rice_type(
    payload: RiceTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Rice type name cannot be empty")

    # Validate brand if provided
    if payload.brand_id:
        brand = db.query(Brand).filter(Brand.id == payload.brand_id).first()
        if not brand:
            raise HTTPException(status_code=404, detail=f"Brand {payload.brand_id} not found")

    # Duplicate check (case-insensitive within same brand scope)
    dup = (
        db.query(RiceType)
        .filter(
            func.lower(RiceType.name) == name.lower(),
            (RiceType.brand_id == payload.brand_id)
            if payload.brand_id is not None
            else RiceType.brand_id.is_(None),
        )
        .first()
    )
    if dup:
        if dup.is_active:
            return dup  # idempotent
        dup.is_active = True
        if payload.name_ta:
            dup.name_ta = payload.name_ta
        db.commit()
        db.refresh(dup)
        return dup

    rt = RiceType(
        name=name,
        name_ta=(payload.name_ta or "").strip() or None,
        brand_id=payload.brand_id,
        is_active=True,
    )
    db.add(rt)
    db.commit()
    db.refresh(rt)
    return rt


# ============================================================
# UPDATE RICE TYPE  (admin only)
# ============================================================
@router.put("/{rice_type_id}", response_model=RiceTypeOut)
def update_rice_type(
    rice_type_id: int,
    payload: RiceTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rt = db.query(RiceType).filter(RiceType.id == rice_type_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Rice type not found")

    data = payload.model_dump(exclude_none=True)

    # Validate new brand_id
    if "brand_id" in data and data["brand_id"]:
        if not db.query(Brand).filter(Brand.id == data["brand_id"]).first():
            raise HTTPException(status_code=404, detail="Brand not found")

    # Duplicate name check
    if "name" in data:
        new_name = data["name"].strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        target_brand = data.get("brand_id", rt.brand_id)
        dup = (
            db.query(RiceType)
            .filter(
                func.lower(RiceType.name) == new_name.lower(),
                RiceType.id != rice_type_id,
                (RiceType.brand_id == target_brand)
                if target_brand is not None
                else RiceType.brand_id.is_(None),
            )
            .first()
        )
        if dup:
            raise HTTPException(status_code=400, detail=f"Rice type '{new_name}' already exists")
        data["name"] = new_name

    for field, value in data.items():
        setattr(rt, field, value)

    db.commit()
    db.refresh(rt)
    return rt


# ============================================================
# DELETE RICE TYPE  (admin only — soft if in use)
# ============================================================
@router.delete("/{rice_type_id}")
def delete_rice_type(
    rice_type_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rt = db.query(RiceType).filter(RiceType.id == rice_type_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Rice type not found")

    in_use = (
        db.query(Stock.id).filter(Stock.rice_type_id == rice_type_id).first() is not None
        or db.query(TransactionItem.id).filter(TransactionItem.rice_type_id == rice_type_id).first() is not None
    )

    if in_use:
        rt.is_active = False
        db.commit()
        return {"message": "Rice type deactivated (in-use, soft delete)", "soft_delete": True}

    db.delete(rt)
    db.commit()
    return {"message": "Rice type deleted", "soft_delete": False}