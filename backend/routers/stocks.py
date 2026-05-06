# backend/routers/stocks.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_
from typing import List, Optional
from datetime import datetime, date
from calendar import monthrange

from database import get_db
from models import (
    Stock, StockWeightBreakdown,
    Transaction, TransactionItem, TransactionItemWeight, TransactionItemSplit,
    Brand, RiceType, Warehouse,
    TransactionType, User, UserRole,
)
from schemas import (
    StockCreate, StockUpdate, StockOut, StockWithInventory,
    StockWeightBreakdownOut,
    StockHistoryEntry, CalendarDayEntry,
)
from utils.deps import get_current_user, require_admin

router = APIRouter()


# ============================================================
# CONSTANTS
# ============================================================
PIECE_THRESHOLD_KG = 25.0  # weight < this → piece (loose), else → bag


# ============================================================
# HELPERS — refactored for new schema (TransactionItem-based)
# ============================================================
def _stock_inbound_outbound(stock: Stock, db: Session) -> tuple:
    """
    Compute inbound/outbound unit totals for a stock row using new schema.
    A stock row identifies (brand_id, rice_type_id, warehouse_id, bag_weight_kg).
    Note: 'units' here = bags + pieces (matches frontend convention).
    """
    bag_size = float(stock.bag_weight_kg or 25.0)

    # Inbound — sum splits matching this brand+warehouse+bag_size
    in_q = (
        db.query(func.coalesce(func.sum(TransactionItemSplit.bags), 0))
        .join(TransactionItem, TransactionItem.id == TransactionItemSplit.item_id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            TransactionItem.brand_id == stock.brand_id,
            TransactionItem.bag_size_kg == bag_size,
            TransactionItemSplit.warehouse_id == stock.warehouse_id,
        )
    )
    if stock.rice_type_id is not None:
        in_q = in_q.filter(TransactionItem.rice_type_id == stock.rice_type_id)
    inbound = int(in_q.scalar() or 0)

    # Outbound — sum items where warehouse_id matches
    out_q = (
        db.query(func.coalesce(func.sum(TransactionItem.total_bags), 0))
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == TransactionType.outbound,
            TransactionItem.brand_id == stock.brand_id,
            TransactionItem.bag_size_kg == bag_size,
            TransactionItem.warehouse_id == stock.warehouse_id,
        )
    )
    if stock.rice_type_id is not None:
        out_q = out_q.filter(TransactionItem.rice_type_id == stock.rice_type_id)
    outbound = int(out_q.scalar() or 0)

    return inbound, outbound


def _last_buy_price(stock: Stock, db: Session) -> Optional[float]:
    """Latest inbound price for this brand (for Send-page profit/loss preview)."""
    last = (
        db.query(Transaction)
        .join(Transaction.items)
        .filter(
            Transaction.transaction_type == TransactionType.inbound,
            Transaction.price.isnot(None),
            TransactionItem.brand_id == stock.brand_id,
        )
        .order_by(Transaction.transaction_date.desc())
        .first()
    )
    return float(last.price) if last and last.price is not None else None


def _stock_with_inv(s: Stock, db: Session, include_price: bool = False) -> StockWithInventory:
    """
    Build a StockWithInventory response row, including:
    - Aggregated inbound/outbound counts
    - Last buy price (admin only)
    - Per-weight breakdown rows (so frontend can show 25kg×N, 30kg×N, 5kg×N etc.)
    """
    inbound, outbound = _stock_inbound_outbound(s, db)
    remaining = max(0, inbound - outbound)
    bag_size = float(s.bag_weight_kg or 25.0)

    # ── Fetch weight breakdown rows for this stock ──
    breakdown_rows = (
        db.query(StockWeightBreakdown)
        .filter(StockWeightBreakdown.stock_id == s.id)
        .order_by(StockWeightBreakdown.weight_kg.desc())
        .all()
    )
    weight_breakdowns = [
        StockWeightBreakdownOut.model_validate(b)
        for b in breakdown_rows
        if (b.quantity or 0) > 0
    ]

    return StockWithInventory(
        id=s.id,
        brand_id=s.brand_id,
        rice_type_id=s.rice_type_id,
        warehouse_id=s.warehouse_id,
        brand_name=s.brand_name,
        brand_name_ta=s.brand_name_ta,
        rice_type=s.rice_type,
        rice_type_ta=s.rice_type_ta,
        production_company=s.production_company,
        production_company_ta=s.production_company_ta,
        bag_weight_kg=bag_size,
        total_bags=s.total_bags or 0,
        total_weight_kg=s.total_weight_kg or 0.0,
        is_active=s.is_active,
        created_at=s.created_at,
        remaining_bags=remaining,
        remaining_kg=remaining * bag_size,
        total_inbound_bags=inbound,
        total_outbound_bags=outbound,
        last_buy_price=_last_buy_price(s, db) if include_price else None,
        # ── KEY: populate breakdowns so frontend can render 25/26/30 bags + 5/10 pieces ──
        weight_breakdowns=weight_breakdowns,
    )


def _strip_admin_fields(entry: dict, is_admin: bool) -> dict:
    """Remove sensitive fields for non-admin users."""
    if is_admin:
        return entry
    for f in ("mill_owner_name", "price", "sell_price"):
        entry[f] = None
    return entry


# ============================================================
# LIST STOCKS  (with filters)
# ============================================================
@router.get("", response_model=List[StockWithInventory])
def list_stocks(
    brand_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    mill_owner_name: Optional[str] = None,
    vehicle_no: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List stocks with optional filters.
    mill_owner_name / vehicle_no / date range filter to stocks that have at least
    one matching transaction.
    """
    q = db.query(Stock)
    if active_only:
        q = q.filter(Stock.is_active == True)  # noqa
    if brand_id:
        q = q.filter(Stock.brand_id == brand_id)
    if warehouse_id:
        q = q.filter(Stock.warehouse_id == warehouse_id)

    # Filters that need to join through transactions
    if mill_owner_name or vehicle_no or date_from or date_to:
        tq = (
            db.query(Stock.id)
            .join(TransactionItem, TransactionItem.brand_id == Stock.brand_id)
            .join(Transaction, Transaction.id == TransactionItem.transaction_id)
            .filter(TransactionItem.bag_size_kg == Stock.bag_weight_kg)
        )
        if mill_owner_name:
            tq = tq.filter(Transaction.mill_owner_name.ilike(f"%{mill_owner_name}%"))
        if vehicle_no:
            tq = tq.filter(Transaction.vehicle_number.ilike(f"%{vehicle_no}%"))
        if date_from:
            tq = tq.filter(Transaction.transaction_date >= datetime.combine(date_from, datetime.min.time()))
        if date_to:
            tq = tq.filter(Transaction.transaction_date <= datetime.combine(date_to, datetime.max.time()))

        matching_ids = [row[0] for row in tq.distinct().all()]
        if not matching_ids:
            return []
        q = q.filter(Stock.id.in_(matching_ids))

    is_admin = current_user.role == UserRole.admin
    return [_stock_with_inv(s, db, include_price=is_admin) for s in q.all()]


# ============================================================
# CALENDAR  (must come BEFORE /{stock_id} so it doesn't get matched as ID)
# ============================================================
@router.get("/calendar")
def get_calendar(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns inbound/outbound counts per day for the given month.
    Shape:
      {
        "2026-05-01": { "inbound": 50, "outbound": 20, "transactions": [...] },
        "2026-05-02": { ... },
      }
    """
    _, last_day = monthrange(year, month)
    start = datetime(year, month, 1, 0, 0, 0)
    end = datetime(year, month, last_day, 23, 59, 59)

    rows = (
        db.query(Transaction)
        .options(joinedload(Transaction.items))
        .filter(
            Transaction.transaction_date >= start,
            Transaction.transaction_date <= end,
        )
        .order_by(Transaction.transaction_date.asc())
        .all()
    )

    is_admin = current_user.role == UserRole.admin
    by_day: dict = {}

    for t in rows:
        key = t.transaction_date.strftime("%Y-%m-%d")
        if key not in by_day:
            by_day[key] = {"inbound": 0, "outbound": 0, "transactions": []}

        if t.transaction_type == TransactionType.inbound:
            by_day[key]["inbound"] += t.total_bags or 0
        else:
            by_day[key]["outbound"] += t.total_bags or 0

        entry = {
            "id": t.id,
            "transaction_type": t.transaction_type.value if hasattr(t.transaction_type, "value") else str(t.transaction_type),
            "transaction_date": t.transaction_date.isoformat(),
            "vehicle_number": t.vehicle_number,
            "driver_name": t.driver_name,
            "driver_number": t.driver_number,
            "source": t.source,
            "destination": t.destination,
            "commission_partner": t.commission_partner,
            "total_bags": t.total_bags or 0,
            "total_weight_kg": t.total_weight_kg or 0.0,
            "quantity_bags": t.total_bags or 0,
            "quantity_kg": t.total_weight_kg or 0.0,
            "admin_pending": bool(t.admin_pending),
            "mill_owner_name": t.mill_owner_name,
            "price": t.price,
            "sell_price": t.sell_price,
        }
        by_day[key]["transactions"].append(_strip_admin_fields(entry, is_admin))

    return by_day


# ============================================================
# GET ONE STOCK
# ============================================================
@router.get("/{stock_id}", response_model=StockWithInventory)
def get_stock(
    stock_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(Stock).filter(Stock.id == stock_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Stock not found")
    is_admin = current_user.role == UserRole.admin
    return _stock_with_inv(s, db, include_price=is_admin)


# ============================================================
# STOCK HISTORY  (info button → past transactions)
# ============================================================
@router.get("/{stock_id}/history", response_model=List[StockHistoryEntry])
def get_stock_history(
    stock_id: int,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns transaction history matching this stock's brand+warehouse+bag_size.
    Hides admin-only fields for non-admin users.
    """
    s = db.query(Stock).filter(Stock.id == stock_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Stock not found")

    bag_size = float(s.bag_weight_kg or 25.0)
    is_admin = current_user.role == UserRole.admin

    q = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.items),
            joinedload(Transaction.created_by_user),
        )
        .join(Transaction.items)
        .filter(
            TransactionItem.brand_id == s.brand_id,
            TransactionItem.bag_size_kg == bag_size,
            or_(
                TransactionItem.warehouse_id == s.warehouse_id,
                TransactionItem.splits.any(TransactionItemSplit.warehouse_id == s.warehouse_id),
            ),
        )
    )
    if s.rice_type_id is not None:
        q = q.filter(TransactionItem.rice_type_id == s.rice_type_id)

    txs = q.order_by(Transaction.transaction_date.desc()).distinct().limit(limit).all()

    history: List[StockHistoryEntry] = []
    for t in txs:
        if t.transaction_type == TransactionType.inbound:
            bags_here = 0
            kg_here = 0.0
            for it in t.items:
                if it.brand_id != s.brand_id or float(it.bag_size_kg) != bag_size:
                    continue
                if s.rice_type_id is not None and it.rice_type_id != s.rice_type_id:
                    continue
                for sp in it.splits:
                    if sp.warehouse_id == s.warehouse_id:
                        bags_here += sp.bags or 0
                        kg_here += sp.weight_kg or 0
        else:
            bags_here = 0
            kg_here = 0.0
            for it in t.items:
                if it.brand_id != s.brand_id or float(it.bag_size_kg) != bag_size:
                    continue
                if s.rice_type_id is not None and it.rice_type_id != s.rice_type_id:
                    continue
                if it.warehouse_id != s.warehouse_id:
                    continue
                bags_here += it.total_bags or 0
                kg_here += it.total_weight_kg or 0

        if bags_here == 0:
            continue

        entry = StockHistoryEntry(
            id=t.id,
            transaction_type=t.transaction_type,
            transaction_date=t.transaction_date,
            vehicle_number=t.vehicle_number,
            driver_name=t.driver_name,
            driver_number=t.driver_number,
            source=t.source,
            destination=t.destination,
            commission_partner=t.commission_partner,
            total_bags=bags_here,
            total_weight_kg=kg_here,
            quantity_bags=bags_here,
            quantity_kg=kg_here,
            admin_pending=bool(t.admin_pending),
            mill_owner_name=t.mill_owner_name if is_admin else None,
            price=t.price if is_admin else None,
            sell_price=t.sell_price if is_admin else None,
        )
        history.append(entry)

    return history


# ============================================================
# CREATE STOCK  (admin only — manual seed)
# ============================================================
@router.post("", response_model=StockOut, status_code=status.HTTP_201_CREATED)
def create_stock(
    payload: StockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    data = payload.model_dump()

    if not data.get("brand_id") and data.get("brand_name"):
        name = data["brand_name"].strip()
        brand = db.query(Brand).filter(func.lower(Brand.name) == name.lower()).first()
        if not brand:
            brand = Brand(
                name=name,
                name_ta=data.get("brand_name_ta"),
                created_by=current_user.id,
                is_active=True,
            )
            db.add(brand)
            db.flush()
        data["brand_id"] = brand.id

    if not data.get("brand_id"):
        raise HTTPException(status_code=400, detail="brand_id or brand_name is required")

    if not data.get("warehouse_id"):
        wh = db.query(Warehouse).filter(Warehouse.is_active == True).first()  # noqa
        if not wh:
            raise HTTPException(status_code=400, detail="No active warehouse found; create one first")
        data["warehouse_id"] = wh.id

    if not data.get("rice_type_id") and data.get("rice_type"):
        rt_name = data["rice_type"].strip()
        rt = (
            db.query(RiceType)
            .filter(
                func.lower(RiceType.name) == rt_name.lower(),
                or_(RiceType.brand_id == data["brand_id"], RiceType.brand_id.is_(None)),
            )
            .first()
        )
        if not rt:
            rt = RiceType(
                name=rt_name,
                name_ta=data.get("rice_type_ta"),
                brand_id=data["brand_id"],
                is_active=True,
            )
            db.add(rt)
            db.flush()
        data["rice_type_id"] = rt.id

    existing = (
        db.query(Stock)
        .filter(
            Stock.brand_id == data["brand_id"],
            Stock.rice_type_id == data.get("rice_type_id"),
            Stock.warehouse_id == data["warehouse_id"],
            Stock.bag_weight_kg == data.get("bag_weight_kg", 25.0),
        )
        .first()
    )
    if existing:
        return existing

    stock = Stock(**{k: v for k, v in data.items() if k in {
        "brand_id", "rice_type_id", "warehouse_id",
        "brand_name", "brand_name_ta", "rice_type", "rice_type_ta",
        "production_company", "production_company_ta", "bag_weight_kg",
    }})
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


# ============================================================
# UPDATE / DELETE
# ============================================================
@router.put("/{stock_id}", response_model=StockOut)
def update_stock(
    stock_id: int,
    payload: StockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(stock, field, value)
    db.commit()
    db.refresh(stock)
    return stock


@router.delete("/{stock_id}")
def delete_stock(
    stock_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    stock.is_active = False
    db.commit()
    return {"message": "Stock deactivated"}