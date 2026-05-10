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
    Returns (stock_kg, total_bags) for a warehouse.

    ROOT CAUSE FIX: Previously this read TransactionItemSplit.bags (raw inbound
    split count) minus TransactionItem.total_bags (outbound).  But Stock.total_bags
    is the authoritative remaining count — it is incremented on inbound and
    decremented on outbound by _apply_inbound_to_stock / _apply_outbound_to_stock.
    Using TransactionItemSplit produced totals that diverged from the /stocks page
    because the split count was never decremented on outbound.

    Now we sum Stock.total_bags and Stock.total_weight_kg directly, which always
    matches what the Stocks page shows.
    """
    result = (
        db.query(
            func.coalesce(func.sum(Stock.total_bags), 0),
            func.coalesce(func.sum(Stock.total_weight_kg), 0.0),
        )
        .filter(Stock.warehouse_id == warehouse_id)
        .first()
    )
    total_bags, total_kg = result
    return (
        max(0.0, float(total_kg or 0)),
        max(0, int(total_bags or 0)),
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
    """
    Bags remaining for a (brand, warehouse[, bag_size]) combo.

    FIX: Use Stock.total_bags directly — it is decremented on every outbound
    by _apply_outbound_to_stock, making it the authoritative remaining count
    (same source used by the /stocks page).  The previous implementation
    recomputed inbound - outbound from transaction tables which diverged from
    the Stock table when proportional split rounding was involved.
    """
    q = db.query(func.coalesce(func.sum(Stock.total_bags), 0)).filter(
        Stock.brand_id == brand_id,
        Stock.warehouse_id == warehouse_id,
    )
    if bag_size is not None:
        q = q.filter(Stock.bag_weight_kg == bag_size)
    return max(0, int(q.scalar() or 0))


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

    # ROOT CAUSE FIX: Read directly from Stock + StockWeightBreakdown tables.
    # These are kept in sync by _apply_inbound_to_stock / _apply_outbound_to_stock
    # on every transaction, so they always match what the /stocks page displays.
    # The previous implementation recomputed from TransactionItemSplit with
    # proportional allocation, which diverged from Stock.total_bags due to
    # integer rounding in the split math.
    stock_rows = (
        db.query(Stock)
        .filter(
            Stock.warehouse_id == warehouse_id,
            Stock.total_bags > 0,
        )
        .all()
    )

    result = []
    for s in stock_rows:
        bag_size = float(s.bag_weight_kg or 25.0)

        # Compute inbound/outbound from the Stock row directly
        # (total_bags is already the net remaining after outbound)
        remaining = max(0, int(s.total_bags or 0))
        if remaining == 0:
            continue

        # Inbound = what was ever put in (need to compute for display stats)
        in_bags = (
            db.query(func.coalesce(func.sum(TransactionItemSplit.bags), 0))
            .join(TransactionItem, TransactionItem.id == TransactionItemSplit.item_id)
            .join(Transaction, Transaction.id == TransactionItem.transaction_id)
            .filter(
                Transaction.transaction_type == TransactionType.inbound,
                TransactionItem.brand_id == s.brand_id,
                TransactionItem.bag_size_kg == bag_size,
                TransactionItemSplit.warehouse_id == warehouse_id,
            )
        )
        if s.rice_type_id is not None:
            in_bags = in_bags.filter(TransactionItem.rice_type_id == s.rice_type_id)
        total_inbound = int(in_bags.scalar() or 0)
        total_outbound = max(0, total_inbound - remaining)

        # Resolve names
        brand = db.query(Brand).filter(Brand.id == s.brand_id).first()
        rice_type = (
            db.query(RiceType).filter(RiceType.id == s.rice_type_id).first()
            if s.rice_type_id else None
        )

        # Weight breakdowns from StockWeightBreakdown (kept in sync by transactions)
        breakdown_rows = (
            db.query(StockWeightBreakdown)
            .filter(
                StockWeightBreakdown.stock_id == s.id,
                StockWeightBreakdown.quantity > 0,
            )
            .order_by(StockWeightBreakdown.weight_kg.desc())
            .all()
        )
        weight_breakdowns = [
            {"weight_kg": float(b.weight_kg), "quantity": int(b.quantity or 0)}
            for b in breakdown_rows
            if (b.quantity or 0) > 0
        ]

        result.append({
            "stock_id": s.id,
            "brand_id": s.brand_id,
            "rice_type_id": s.rice_type_id,
            "brand_name": s.brand_name or (brand.name if brand else None),
            "brand_name_ta": s.brand_name_ta or (brand.name_ta if brand else None),
            "rice_type": s.rice_type or (rice_type.name if rice_type else None),
            "rice_type_ta": s.rice_type_ta or (rice_type.name_ta if rice_type else None),
            "bag_weight_kg": bag_size,
            "total_inbound_bags": total_inbound,
            "total_outbound_bags": total_outbound,
            "remaining_bags": remaining,
            "remaining_kg": float(s.total_weight_kg or remaining * bag_size),
            "weight_breakdowns": weight_breakdowns,
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

    # FIX: Filter StockWeightBreakdown to only include rows with quantity > 0
    # so that fully-dispatched items don't inflate the summary.
    rows = (
        db.query(
            StockWeightBreakdown.weight_kg,
            func.sum(StockWeightBreakdown.quantity).label("quantity"),
        )
        .join(Stock, Stock.id == StockWeightBreakdown.stock_id)
        .filter(
            Stock.warehouse_id == warehouse_id,
            StockWeightBreakdown.quantity > 0,
        )
        .group_by(StockWeightBreakdown.weight_kg)
        .order_by(StockWeightBreakdown.weight_kg.desc())
        .all()
    )

    summary = [
        {"weight_kg": float(r.weight_kg), "quantity": int(r.quantity or 0)}
        for r in rows
        if (r.quantity or 0) > 0
    ]

    items = (
        db.query(
            Stock.id.label("stock_id"),
            Stock.brand_name,
            StockWeightBreakdown.weight_kg,
            StockWeightBreakdown.quantity,
        )
        .join(StockWeightBreakdown, StockWeightBreakdown.stock_id == Stock.id)
        .filter(
            Stock.warehouse_id == warehouse_id,
            StockWeightBreakdown.quantity > 0,
        )
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

    # Total bags — from Stock table (authoritative, already net of outbound)
    total_bags = _brand_remaining_in_warehouse(db, warehouse_id, brand_id)

    # ── Weight breakdown ──────────────────────────────────────────────────────
    # ROOT CAUSE FIX: The old code used proportional integer division:
    #   TransactionItemWeight.quantity * TransactionItemSplit.bags / TransactionItem.total_bags
    # This truncates fractional results, so e.g. a 110-bag arrival split 80/30
    # allocated floor(22 * 80/110)=16 pieces to WH1 instead of the actual 30
    # that were physically assigned.
    #
    # Fix: read StockWeightBreakdown directly — it is incremented by
    # _apply_inbound_to_stock and decremented by _apply_outbound_to_stock, so
    # it always reflects the current on-hand quantities (same source as the
    # warehouse panel and stocks page).
    stock_rows = (
        db.query(Stock)
        .filter(
            Stock.brand_id == brand_id,
            Stock.warehouse_id == warehouse_id,
            Stock.total_bags > 0,
        )
        .all()
    )

    total_kg = 0.0
    weight_qty_map: dict = {}
    for s in stock_rows:
        total_kg += float(s.total_weight_kg or 0)
        bd_rows = (
            db.query(StockWeightBreakdown)
            .filter(
                StockWeightBreakdown.stock_id == s.id,
                StockWeightBreakdown.quantity > 0,
            )
            .all()
        )
        for bd in bd_rows:
            wkg = float(bd.weight_kg)
            weight_qty_map[wkg] = weight_qty_map.get(wkg, 0) + int(bd.quantity or 0)

    weight_breakdown: List[BrandWeightBreakdownEntry] = []
    for wkg, qty in sorted(weight_qty_map.items(), reverse=True):
        if qty <= 0:
            continue
        is_piece = wkg < 25
        unit_label = "pieces" if is_piece else "bags"
        weight_breakdown.append(BrandWeightBreakdownEntry(
            weight_kg=wkg,
            quantity=qty,
            bags=qty,
            label=f"{wkg:g}KG × {qty} {unit_label}",
        ))

    # ── Recent arrivals ───────────────────────────────────────────────────────
    # Show raw inbound split bags (how many arrived per transaction).
    # History display — we intentionally don't subtract outbound here.
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

    # ── Rice types breakdown ──────────────────────────────────────────────────
    # FIX: Use Stock.total_bags (current remaining, net of outbound) instead of
    # summing TransactionItemSplit.bags (raw inbound which never decrements).
    # This keeps rice-type counts consistent with the total_bags shown above.
    rt_stock_rows = (
        db.query(Stock)
        .filter(
            Stock.brand_id == brand_id,
            Stock.warehouse_id == warehouse_id,
            Stock.total_bags > 0,
            Stock.rice_type_id.isnot(None),
        )
        .all()
    )
    rice_type_bags: dict = {}
    for s in rt_stock_rows:
        rt = db.query(RiceType).filter(RiceType.id == s.rice_type_id).first()
        name = rt.name if rt else "—"
        rice_type_bags[name] = rice_type_bags.get(name, 0) + int(s.total_bags or 0)

    rice_types = [
        BrandRiceTypeSummary(name=name, bags=bags)
        for name, bags in rice_type_bags.items()
        if bags > 0
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
    existing = (
        db.query(Warehouse)
        .filter(Warehouse.location_name == payload.location_name)
        .first()
    )

    if existing:
        if existing.is_active:
            # A live warehouse with this name already exists — reject.
            raise HTTPException(status_code=400, detail="Warehouse name already exists")

        # ── REACTIVATE soft-deleted warehouse ──────────────────────────────
        # The old row keeps its original id, so every Stock row,
        # TransactionItemSplit, and TransactionItem that was linked to it
        # automatically becomes visible again with its full history intact.
        # Creating a brand-new row would give a different id and leave all
        # historical data orphaned on the dead id.
        existing.is_active = True
        if payload.location_name_ta is not None:
            existing.location_name_ta = payload.location_name_ta
        if payload.address is not None:
            existing.address = payload.address
        if payload.capacity:
            existing.capacity = payload.capacity
        db.commit()
        db.refresh(existing)
        return existing

    # Truly new name — insert a fresh row.
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