# backend/routers/dashboard.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from datetime import datetime, date, timedelta
from typing import Optional, List

from database import get_db
from models import (
    Transaction, TransactionItem, TransactionItemSplit,
    Stock, Warehouse, Brand, MillOwner,
    TransactionType, ApprovalStatus, User, UserRole,
)
from schemas import (
    DashboardSummary, StockWithInventory, WarehouseWithStock,
    TransactionOut, DashboardDailyCount, DashboardTotalStock,
    PendingApprovalEntry,
)
from utils.deps import get_current_user, require_admin

router = APIRouter()


# ============================================================
# HELPERS
# ============================================================
def _day_bounds(d: date):
    """Return (start, end) datetimes covering the entire day."""
    return (
        datetime.combine(d, datetime.min.time()),
        datetime.combine(d, datetime.max.time()),
    )


def _txn_aggregate(
    db: Session,
    tx_type: TransactionType,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    warehouse_id: Optional[int] = None,
):
    """
    Returns (total_bags, total_kg, txn_count) for a given type / range.
    Uses Transaction.total_bags + Transaction.total_weight_kg (new schema).
    For warehouse-filtered queries, drills into TransactionItem / splits.
    """
    if warehouse_id:
        # Need to sum at item-split level for inbound, or item.warehouse_id for outbound
        if tx_type == TransactionType.inbound:
            q = (
                db.query(
                    func.coalesce(func.sum(TransactionItemSplit.bags), 0),
                    func.coalesce(func.sum(TransactionItemSplit.weight_kg), 0.0),
                )
                .join(TransactionItem, TransactionItem.id == TransactionItemSplit.item_id)
                .join(Transaction, Transaction.id == TransactionItem.transaction_id)
                .filter(
                    Transaction.transaction_type == tx_type,
                    TransactionItemSplit.warehouse_id == warehouse_id,
                )
            )
            cnt_q = (
                db.query(func.count(func.distinct(Transaction.id)))
                .join(TransactionItem, TransactionItem.transaction_id == Transaction.id)
                .join(TransactionItemSplit, TransactionItemSplit.item_id == TransactionItem.id)
                .filter(
                    Transaction.transaction_type == tx_type,
                    TransactionItemSplit.warehouse_id == warehouse_id,
                )
            )
        else:  # outbound
            q = (
                db.query(
                    func.coalesce(func.sum(TransactionItem.total_bags), 0),
                    func.coalesce(func.sum(TransactionItem.total_weight_kg), 0.0),
                )
                .join(Transaction, Transaction.id == TransactionItem.transaction_id)
                .filter(
                    Transaction.transaction_type == tx_type,
                    TransactionItem.warehouse_id == warehouse_id,
                )
            )
            cnt_q = (
                db.query(func.count(func.distinct(Transaction.id)))
                .join(TransactionItem, TransactionItem.transaction_id == Transaction.id)
                .filter(
                    Transaction.transaction_type == tx_type,
                    TransactionItem.warehouse_id == warehouse_id,
                )
            )

        if start:
            q = q.filter(Transaction.transaction_date >= start)
            cnt_q = cnt_q.filter(Transaction.transaction_date >= start)
        if end:
            q = q.filter(Transaction.transaction_date <= end)
            cnt_q = cnt_q.filter(Transaction.transaction_date <= end)

        bags, kg = q.first()
        cnt = cnt_q.scalar() or 0
        return int(bags or 0), float(kg or 0.0), int(cnt)

    # No warehouse filter — header-level sum is fine
    q = db.query(
        func.coalesce(func.sum(Transaction.total_bags), 0),
        func.coalesce(func.sum(Transaction.total_weight_kg), 0.0),
        func.count(Transaction.id),
    ).filter(Transaction.transaction_type == tx_type)

    if start:
        q = q.filter(Transaction.transaction_date >= start)
    if end:
        q = q.filter(Transaction.transaction_date <= end)

    bags, kg, cnt = q.first()
    return int(bags or 0), float(kg or 0.0), int(cnt or 0)


def _stock_remaining(db: Session, stock: Stock) -> dict:
    """
    Compute remaining bags/kg for a stock row from TransactionItem aggregates.
    A stock row is uniquely identified by (brand_id, rice_type_id, warehouse_id, bag_weight_kg).
    """
    bag_size = float(stock.bag_weight_kg or 25.0)

    # Inbound: use TransactionItemSplit (each split tied to a warehouse)
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

    # Outbound: use TransactionItem.warehouse_id
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

    remaining = max(0, inbound - outbound)
    return {
        "inbound": inbound,
        "outbound": outbound,
        "remaining_bags": remaining,
        "remaining_kg": remaining * bag_size,
    }


# ============================================================
# /summary  (refactored — uses new schema)
# ============================================================
@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today_start, today_end = _day_bounds(date.today())

    total_warehouses = db.query(Warehouse).filter(Warehouse.is_active == True).count()  # noqa
    total_stocks = db.query(Stock).filter(Stock.is_active == True).count()  # noqa

    today_in_bags, today_in_kg, _ = _txn_aggregate(db, TransactionType.inbound, today_start, today_end)
    today_out_bags, today_out_kg, _ = _txn_aggregate(db, TransactionType.outbound, today_start, today_end)

    total_in_bags, total_in_kg, _ = _txn_aggregate(db, TransactionType.inbound)
    total_out_bags, total_out_kg, _ = _txn_aggregate(db, TransactionType.outbound)

    # Low stock items (< 50 bags) using new aggregation
    low_stock: List[StockWithInventory] = []
    for s in db.query(Stock).filter(Stock.is_active == True).all():  # noqa
        info = _stock_remaining(db, s)
        if info["remaining_bags"] < 50:
            low_stock.append(StockWithInventory(
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
                bag_weight_kg=s.bag_weight_kg,
                total_bags=s.total_bags or 0,
                total_weight_kg=s.total_weight_kg or 0.0,
                is_active=s.is_active,
                created_at=s.created_at,
                remaining_bags=info["remaining_bags"],
                remaining_kg=info["remaining_kg"],
                total_inbound_bags=info["inbound"],
                total_outbound_bags=info["outbound"],
            ))

    # Recent transactions (new schema — load items)
    recent_txs = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.items).joinedload(TransactionItem.brand),
            joinedload(Transaction.items).joinedload(TransactionItem.rice_type_ref),
            joinedload(Transaction.items).joinedload(TransactionItem.warehouse),
            joinedload(Transaction.items).joinedload(TransactionItem.weights),
            joinedload(Transaction.items).joinedload(TransactionItem.splits),
            joinedload(Transaction.created_by_user),
        )
        .order_by(Transaction.created_at.desc())
        .limit(10)
        .all()
    )

    # Per-warehouse aggregates
    warehouse_summary: List[WarehouseWithStock] = []
    for w in db.query(Warehouse).filter(Warehouse.is_active == True).all():  # noqa
        in_bags, in_kg, _ = _txn_aggregate(db, TransactionType.inbound, warehouse_id=w.id)
        out_bags, out_kg, _ = _txn_aggregate(db, TransactionType.outbound, warehouse_id=w.id)
        stock_kg = max(0.0, in_kg - out_kg)
        bags = max(0, in_bags - out_bags)
        pct = (stock_kg / (w.capacity * 1000) * 100) if (w.capacity or 0) > 0 else 0
        warehouse_summary.append(WarehouseWithStock(
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
        ))

    return DashboardSummary(
        total_warehouses=total_warehouses,
        total_stock_types=total_stocks,
        total_inbound_today=today_in_bags,
        total_outbound_today=today_out_bags,
        total_stock_kg=max(0.0, total_in_kg - total_out_kg),
        total_bags=max(0, total_in_bags - total_out_bags),
        low_stock_items=low_stock,
        recent_transactions=recent_txs,
        warehouse_summary=warehouse_summary,
    )


# ============================================================
# /inbound/daily   — bags arrived per day
# ============================================================
@router.get("/inbound/daily", response_model=DashboardDailyCount)
def inbound_daily(
    date: Optional[date] = Query(None, description="Defaults to today"),
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = date or datetime.utcnow().date()
    start, end = _day_bounds(target)
    bags, kg, cnt = _txn_aggregate(
        db, TransactionType.inbound, start, end, warehouse_id=warehouse_id
    )
    return DashboardDailyCount(
        date=target.strftime("%Y-%m-%d"),
        total_bags=bags,
        total_weight_kg=kg,
        transaction_count=cnt,
    )


# ============================================================
# /outbound/daily   — bags dispatched per day
# ============================================================
@router.get("/outbound/daily", response_model=DashboardDailyCount)
def outbound_daily(
    date: Optional[date] = Query(None, description="Defaults to today"),
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    target = date or datetime.utcnow().date()
    start, end = _day_bounds(target)
    bags, kg, cnt = _txn_aggregate(
        db, TransactionType.outbound, start, end, warehouse_id=warehouse_id
    )
    return DashboardDailyCount(
        date=target.strftime("%Y-%m-%d"),
        total_bags=bags,
        total_weight_kg=kg,
        transaction_count=cnt,
    )


# ============================================================
# /inbound/range   — multi-day inbound trend (for charts)
# ============================================================
@router.get("/inbound/range", response_model=List[DashboardDailyCount])
def inbound_range(
    days: int = Query(7, ge=1, le=90),
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = datetime.utcnow().date()
    out: List[DashboardDailyCount] = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        s, e = _day_bounds(d)
        bags, kg, cnt = _txn_aggregate(db, TransactionType.inbound, s, e, warehouse_id=warehouse_id)
        out.append(DashboardDailyCount(
            date=d.strftime("%Y-%m-%d"),
            total_bags=bags,
            total_weight_kg=kg,
            transaction_count=cnt,
        ))
    return out


# ============================================================
# /outbound/range  — multi-day outbound trend
# ============================================================
@router.get("/outbound/range", response_model=List[DashboardDailyCount])
def outbound_range(
    days: int = Query(7, ge=1, le=90),
    warehouse_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = datetime.utcnow().date()
    out: List[DashboardDailyCount] = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        s, e = _day_bounds(d)
        bags, kg, cnt = _txn_aggregate(db, TransactionType.outbound, s, e, warehouse_id=warehouse_id)
        out.append(DashboardDailyCount(
            date=d.strftime("%Y-%m-%d"),
            total_bags=bags,
            total_weight_kg=kg,
            transaction_count=cnt,
        ))
    return out


# ============================================================
# /total-stock   — overall warehouse totals
# ============================================================
@router.get("/total-stock", response_model=DashboardTotalStock)
def get_total_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_in_bags, total_in_kg, _ = _txn_aggregate(db, TransactionType.inbound)
    total_out_bags, total_out_kg, _ = _txn_aggregate(db, TransactionType.outbound)

    total_warehouses = db.query(Warehouse).filter(Warehouse.is_active == True).count()  # noqa
    total_brands = db.query(Brand).filter(Brand.is_active == True).count()  # noqa

    return DashboardTotalStock(
        total_bags=max(0, total_in_bags - total_out_bags),
        total_kg=max(0.0, total_in_kg - total_out_kg),
        total_warehouses=int(total_warehouses),
        total_brands=int(total_brands),
    )


# ============================================================
# /pending-approvals   — admin queue
# ============================================================
@router.get("/pending-approvals", response_model=List[PendingApprovalEntry])
def pending_approvals(
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rows = (
        db.query(Transaction)
        .options(joinedload(Transaction.created_by_user))
        .filter(
            (Transaction.admin_pending == True)  # noqa
            | (Transaction.approval_status == ApprovalStatus.pending)
        )
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .all()
    )

    return [
        PendingApprovalEntry(
            id=t.id,
            transaction_type=t.transaction_type,
            transaction_date=t.transaction_date,
            vehicle_number=t.vehicle_number,
            driver_name=t.driver_name,
            driver_number=t.driver_number,
            total_bags=t.total_bags or 0,
            total_weight_kg=t.total_weight_kg or 0.0,
            source=t.source,
            destination=t.destination,
            commission_partner=t.commission_partner,
            admin_pending=bool(t.admin_pending),
            approval_status=t.approval_status,
            created_at=t.created_at,
            created_by_user=t.created_by_user,
        )
        for t in rows
    ]


# ============================================================
# /pending-approvals/count  — small badge counter for navbar
# ============================================================
@router.get("/pending-approvals/count")
def pending_approvals_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    count = (
        db.query(func.count(Transaction.id))
        .filter(
            (Transaction.admin_pending == True)  # noqa
            | (Transaction.approval_status == ApprovalStatus.pending)
        )
        .scalar()
        or 0
    )
    return {"pending_count": int(count)}


# ============================================================
# /top-brands   — top N brands by total bags moved (last N days)
# ============================================================
@router.get("/top-brands")
def top_brands(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(5, ge=1, le=20),
    direction: str = Query("inbound", pattern="^(inbound|outbound)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = datetime.combine(date.today() - timedelta(days=days), datetime.min.time())
    tx_type = TransactionType.inbound if direction == "inbound" else TransactionType.outbound

    rows = (
        db.query(
            Brand.id.label("brand_id"),
            Brand.name.label("brand_name"),
            Brand.name_ta.label("brand_name_ta"),
            func.coalesce(func.sum(TransactionItem.total_bags), 0).label("total_bags"),
            func.coalesce(func.sum(TransactionItem.total_weight_kg), 0.0).label("total_kg"),
        )
        .join(TransactionItem, TransactionItem.brand_id == Brand.id)
        .join(Transaction, Transaction.id == TransactionItem.transaction_id)
        .filter(
            Transaction.transaction_type == tx_type,
            Transaction.transaction_date >= start,
        )
        .group_by(Brand.id, Brand.name, Brand.name_ta)
        .order_by(func.sum(TransactionItem.total_bags).desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "brand_id": r.brand_id,
            "brand_name": r.brand_name,
            "brand_name_ta": r.brand_name_ta,
            "total_bags": int(r.total_bags or 0),
            "total_kg": float(r.total_kg or 0),
        }
        for r in rows
    ]