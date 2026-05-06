# backend/routers/warehouses.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List, Optional

from database import get_db
from models import (
    Warehouse, Stock, StockWeightBreakdown,
    Transaction, TransactionItem, TransactionItemWeight, TransactionItemSplit,
    Brand, RiceType, TransactionType, User,
)
from schemas import (
    WarehouseCreate, WarehouseUpdate, WarehouseOut, WarehouseWithStock,
    WarehouseBrandInfo, BrandWeightBreakdownEntry, BrandRecentArrival, BrandRiceTypeSummary,
    WarehouseWeightBreakdown, WarehouseAvailableBags,
)
from utils.deps import get_current_user, require_admin

router = APIRouter()


# ============================================================
# HELPERS
# ============================================================
def _wh_totals(warehouse_id: int, db: Session) -> tuple:
    """
    Returns (stock_kg, total_bags) for a warehouse using new schema.
    Inbound = TransactionItemSplit (per-warehouse), Outbound = TransactionItem.warehouse_id
    """
    in_q = (
        db.query(
            func.coalesce(func.sum(TransactionItemSplit.bags), 0),
            func.coalesce(func.sum(TransactionItemSplit.weight_kg), 0.0),
        )
        .join(TransactionItem, TransactionItem.id == TransactionItemSplit.item_id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItemSplit.warehouse_id == warehouse_id,
        )
    )
    in_bags, in_kg = in_q.first()

    out_q = (
        db.query(
            func.coalesce(func.sum(TransactionItem.total_bags), 0),
            func.coalesce(func.sum(TransactionItem.total_weight_kg), 0.0),
        )
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.outbound,
            TransactionItem.warehouse_id == warehouse_id,
        )
    )
    out_bags, out_kg = out_q.first()

    return (
        max(0.0, float(in_kg or 0) - float(out_kg or 0)),
        max(0, int(in_bags or 0) - int(out_bags or 0)),
    )


def _wh_with_stock(w: Warehouse, db: Session) -> WarehouseWithStock:
    stock_kg, bags = _wh_totals(w.id, db)
    pct = (stock_kg / (w.capacity * 1000) * 100) if (w.capacity or 0) > 0 else 0
    return WarehouseWithStock(
        id=w.id,
        location_name=w.location_name,
        location_name_ta=w.location_name_ta,
        address=w.address,
        capacity=w.capacity or 0,
        is_active=w.is_active,
        created_at=w.created_at,
        total_stock_kg=stock_kg,
        total_bags=bags,
        stock_percentage=min(100.0, max(0.0, pct)),
    )


def _brand_remaining_in_warehouse(
    db: Session, warehouse_id: int, brand_id: int, bag_size: Optional[float] = None
) -> int:
    """Bags remaining for a (brand, warehouse[, bag_size]) combo."""
    in_q = (
        db.query(func.coalesce(func.sum(TransactionItemSplit.bags), 0))
        .join(TransactionItem, TransactionItem.id == TransactionItemSplit.item_id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItem.brand_id == brand_id,
            TransactionItemSplit.warehouse_id == warehouse_id,
        )
    )
    out_q = (
        db.query(func.coalesce(func.sum(TransactionItem.total_bags), 0))
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.outbound,
            TransactionItem.brand_id == brand_id,
            TransactionItem.warehouse_id == warehouse_id,
        )
    )
    if bag_size is not None:
        in_q = in_q.filter(TransactionItem.bag_size_kg == bag_size)
        out_q = out_q.filter(TransactionItem.bag_size_kg == bag_size)

    return max(0, int(in_q.scalar() or 0) - int(out_q.scalar() or 0))


# ============================================================
# LIST & CRUD
# ============================================================
@router.get("", response_model=List[WarehouseWithStock])
def list_warehouses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [
        _wh_with_stock(w, db)
        for w in db.query(Warehouse).filter(Warehouse.is_active == True).all()  # noqa
    ]


@router.get("/{warehouse_id}", response_model=WarehouseWithStock)
def get_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return _wh_with_stock(w, db)


# ============================================================
# /stocks   (refactored — per-warehouse stock breakdown)
# ============================================================
@router.get("/{warehouse_id}/stocks")
def get_warehouse_stocks(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    w = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # Find every (brand, bag_size) combo that has activity at this warehouse
    combos_in = (
        db.query(
            TransactionItem.brand_id,
            TransactionItem.rice_type_id,
            TransactionItem.bag_size_kg,
        )
        .join(TransactionItemSplit, TransactionItemSplit.item_id == TransactionItem.id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItemSplit.warehouse_id == warehouse_id,
        )
        .distinct()
        .all()
    )
    combos_out = (
        db.query(
            TransactionItem.brand_id,
            TransactionItem.rice_type_id,
            TransactionItem.bag_size_kg,
        )
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.outbound,
            TransactionItem.warehouse_id == warehouse_id,
        )
        .distinct()
        .all()
    )
    seen = set()
    combos = []
    for c in list(combos_in) + list(combos_out):
        key = (c.brand_id, c.rice_type_id, float(c.bag_size_kg))
        if key in seen:
            continue
        seen.add(key)
        combos.append(c)

    result = []
    for c in combos:
        bag_size = float(c.bag_size_kg)

        in_q = (
            db.query(func.coalesce(func.sum(TransactionItemSplit.bags), 0))
            .join(TransactionItem, TransactionItem.id == TransactionItemSplit.item_id)
            .join(Transaction, Transaction.id == TransactionItem.transaction_id)
            .filter(
                Transaction.transaction_type == TransactionType.inbound,
                TransactionItem.brand_id == c.brand_id,
                TransactionItem.bag_size_kg == bag_size,
                TransactionItemSplit.warehouse_id == warehouse_id,
            )
        )
        out_q = (
            db.query(func.coalesce(func.sum(TransactionItem.total_bags), 0))
            .join(Transaction, Transaction.id == TransactionItem.transaction_id)
            .filter(
                Transaction.transaction_type == TransactionType.outbound,
                TransactionItem.brand_id == c.brand_id,
                TransactionItem.bag_size_kg == bag_size,
                TransactionItem.warehouse_id == warehouse_id,
            )
        )
        if c.rice_type_id is not None:
            in_q = in_q.filter(TransactionItem.rice_type_id == c.rice_type_id)
            out_q = out_q.filter(TransactionItem.rice_type_id == c.rice_type_id)

        inbound = int(in_q.scalar() or 0)
        outbound = int(out_q.scalar() or 0)
        remaining = max(0, inbound - outbound)

        # Resolve names
        brand = db.query(Brand).filter(Brand.id == c.brand_id).first()
        rice_type = (
            db.query(RiceType).filter(RiceType.id == c.rice_type_id).first()
            if c.rice_type_id else None
        )

        # Try to find matching stock row (for stock_id)
        stock_row = (
            db.query(Stock)
            .filter(
                Stock.brand_id == c.brand_id,
                Stock.rice_type_id == c.rice_type_id,
                Stock.warehouse_id == warehouse_id,
                Stock.bag_weight_kg == bag_size,
            )
            .first()
        )

        result.append({
            "stock_id": stock_row.id if stock_row else None,
            "brand_id": c.brand_id,
            "rice_type_id": c.rice_type_id,
            "brand_name": brand.name if brand else None,
            "brand_name_ta": brand.name_ta if brand else None,
            "rice_type": rice_type.name if rice_type else None,
            "rice_type_ta": rice_type.name_ta if rice_type else None,
            "bag_weight_kg": bag_size,
            "total_inbound_bags": inbound,
            "total_outbound_bags": outbound,
            "remaining_bags": remaining,
            "remaining_kg": remaining * bag_size,
        })

    result.sort(key=lambda x: x["remaining_bags"], reverse=True)
    return result


# ============================================================
# /available-bags   (for SEND form: lists available bag weights per brand)
# ============================================================
@router.get("/{warehouse_id}/available-bags")
def get_available_bags(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns one row per (brand, bag_weight) combo with remaining bags > 0.
    Frontend uses this in the Send modal to show: "5×5KG, 5×10KG available".
    """
    w = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    combos_in = (
        db.query(TransactionItem.brand_id, TransactionItem.bag_size_kg)
        .join(TransactionItemSplit, TransactionItemSplit.item_id == TransactionItem.id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItemSplit.warehouse_id == warehouse_id,
        )
        .distinct()
        .all()
    )

    rows = []
    for c in combos_in:
        bag_size = float(c.bag_size_kg)
        remaining = _brand_remaining_in_warehouse(db, warehouse_id, c.brand_id, bag_size)
        if remaining <= 0:
            continue

        brand = db.query(Brand).filter(Brand.id == c.brand_id).first()
        rows.append({
            "brand_id": c.brand_id,
            "brand_name": brand.name if brand else None,
            "brand_name_ta": brand.name_ta if brand else None,
            "weight": bag_size,
            "bag_weight_kg": bag_size,
            "quantity": remaining,
            "remaining_bags": remaining,
        })

    return rows


# ============================================================
# /weight-breakdown   (info popup: "10KG in W1, 5KG in W2 ...")
# ============================================================
@router.get("/{warehouse_id}/weight-breakdown")
def get_weight_breakdown(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns aggregated weight pieces (5KG, 10KG, 25KG ...) currently sitting
    in the given warehouse, summed across all brands.
    """
    w = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    # Use StockWeightBreakdown joined to Stock for this warehouse
    rows = (
        db.query(
            StockWeightBreakdown.weight_kg,
            func.sum(StockWeightBreakdown.quantity).label("quantity"),
        )
        .join(Stock, Stock.id == StockWeightBreakdown.stock_id)
        .filter(Stock.warehouse_id == warehouse_id)
        .group_by(StockWeightBreakdown.weight_kg)
        .order_by(StockWeightBreakdown.weight_kg.desc())
        .all()
    )

    summary = [
        {"weight_kg": float(r.weight_kg), "quantity": int(r.quantity or 0)}
        for r in rows
    ]

    items = (
        db.query(
            Stock.id.label("stock_id"),
            Stock.brand_name,
            StockWeightBreakdown.weight_kg,
            StockWeightBreakdown.quantity,
        )
        .join(StockWeightBreakdown, StockWeightBreakdown.stock_id == Stock.id)
        .filter(Stock.warehouse_id == warehouse_id)
        .all()
    )

    return {
        "summary": summary,
        "items": [
            {
                "stock_id": i.stock_id,
                "brand_name": i.brand_name,
                "weight_kg": float(i.weight_kg),
                "quantity": int(i.quantity or 0),
            }
            for i in items
        ],
    }


# ============================================================
# /brands/{brand_id}   (info popup when clicking a brand on WarehousePage)
# ============================================================
@router.get("/{warehouse_id}/brands/{brand_id}", response_model=WarehouseBrandInfo)
def get_warehouse_brand_info(
    warehouse_id: int,
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detailed info for one brand in one warehouse:
      - Total bags / weight
      - Weight breakdown (5KG×?, 10KG×?, 25KG×? ...)
      - Recent arrivals (vehicle, source, mill_owner, etc.)
      - Rice types breakdown
    """
    w = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    # Total bags / kg
    total_bags = _brand_remaining_in_warehouse(db, warehouse_id, brand_id)
    bag_size_rows = (
        db.query(TransactionItem.bag_size_kg)
        .join(TransactionItemSplit, TransactionItemSplit.item_id == TransactionItem.id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItem.brand_id == brand_id,
            TransactionItemSplit.warehouse_id == warehouse_id,
        )
        .distinct()
        .all()
    )

    total_kg = 0.0
    weight_breakdown: List[BrandWeightBreakdownEntry] = []
    for (bag_size,) in bag_size_rows:
        bs = float(bag_size)
        rem = _brand_remaining_in_warehouse(db, warehouse_id, brand_id, bs)
        total_kg += rem * bs
        if rem > 0:
            weight_breakdown.append(BrandWeightBreakdownEntry(
                weight_kg=bs,
                quantity=rem,
                bags=rem,
                label=f"{bs:g}KG × {rem}",
            ))

    # Recent arrivals (last 10 inbound transactions touching this brand+warehouse)
    arrivals_q = (
        db.query(Transaction)
        .options(joinedload(Transaction.items).joinedload(TransactionItem.splits))
        .join(Transaction.items)
        .join(TransactionItem.splits)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItem.brand_id == brand_id,
            TransactionItemSplit.warehouse_id == warehouse_id,
        )
        .order_by(Transaction.transaction_date.desc())
        .distinct()
        .limit(10)
    )
    recent_arrivals: List[BrandRecentArrival] = []
    for t in arrivals_q.all():
        bags_here = 0
        for it in t.items:
            if it.brand_id != brand_id:
                continue
            for sp in it.splits:
                if sp.warehouse_id == warehouse_id:
                    bags_here += sp.bags or 0
        recent_arrivals.append(BrandRecentArrival(
            id=t.id,
            transaction_date=t.transaction_date,
            vehicle_number=t.vehicle_number,
            driver_name=t.driver_name,
            driver_number=t.driver_number,
            source=t.source,
            commission_partner=t.commission_partner,
            mill_owner_name=t.mill_owner_name,
            bags=bags_here,
            total_bags=t.total_bags,
        ))

    # Rice types breakdown
    rt_rows = (
        db.query(
            RiceType.name,
            func.coalesce(func.sum(TransactionItemSplit.bags), 0).label("bags"),
        )
        .join(TransactionItem, TransactionItem.rice_type_id == RiceType.id)
        .join(TransactionItemSplit, TransactionItemSplit.item_id == TransactionItem.id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItem.brand_id == brand_id,
            TransactionItemSplit.warehouse_id == warehouse_id,
        )
        .group_by(RiceType.name)
        .all()
    )
    rice_types = [
        BrandRiceTypeSummary(name=r.name or "—", bags=int(r.bags or 0))
        for r in rt_rows
    ]

    return WarehouseBrandInfo(
        total_bags=total_bags,
        total_weight_kg=total_kg,
        weight_breakdown=weight_breakdown,
        recent_arrivals=recent_arrivals,
        rice_types=rice_types,
    )


# ============================================================
# CREATE / UPDATE / DELETE
# ============================================================
@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(
    payload: WarehouseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(Warehouse).filter(Warehouse.location_name == payload.location_name).first():
        raise HTTPException(status_code=400, detail="Warehouse name already exists")
    warehouse = Warehouse(**payload.model_dump())
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: int,
    payload: WarehouseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(warehouse, field, value)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.delete("/{warehouse_id}")
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    warehouse.is_active = False
    db.commit()
    return {"message": "Warehouse deactivated"}