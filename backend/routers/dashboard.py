from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, date
from database import get_db
from models import Transaction, Stock, Warehouse, TransactionType, User
from schemas import DashboardSummary, StockWithInventory, WarehouseWithStock, TransactionOut
from utils.deps import get_current_user

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_end   = datetime.combine(date.today(), datetime.max.time())

    total_warehouses = db.query(Warehouse).filter(Warehouse.is_active == True).count()
    total_stocks     = db.query(Stock).filter(Stock.is_active == True).count()

    today_in  = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.transaction_type == TransactionType.inbound,  Transaction.transaction_date.between(today_start, today_end)).scalar() or 0
    today_out = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.transaction_type == TransactionType.outbound, Transaction.transaction_date.between(today_start, today_end)).scalar() or 0

    total_in_kg   = db.query(func.sum(Transaction.quantity_kg)).filter(Transaction.transaction_type == TransactionType.inbound).scalar()  or 0
    total_out_kg  = db.query(func.sum(Transaction.quantity_kg)).filter(Transaction.transaction_type == TransactionType.outbound).scalar() or 0
    total_in_bags = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.transaction_type == TransactionType.inbound).scalar()  or 0
    total_out_bags= db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.transaction_type == TransactionType.outbound).scalar() or 0

    # Low stock items (< 50 bags)
    low_stock = []
    for s in db.query(Stock).filter(Stock.is_active == True).all():
        inbound  = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.stock_id == s.id, Transaction.transaction_type == TransactionType.inbound).scalar()  or 0
        outbound = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.stock_id == s.id, Transaction.transaction_type == TransactionType.outbound).scalar() or 0
        remaining = max(0, inbound - outbound)
        if remaining < 50:
            low_stock.append(StockWithInventory(
                id=s.id, brand_name=s.brand_name, brand_name_ta=s.brand_name_ta,
                rice_type=s.rice_type, rice_type_ta=s.rice_type_ta,
                production_company=s.production_company, production_company_ta=s.production_company_ta,
                bag_weight_kg=s.bag_weight_kg,
                is_active=s.is_active, created_at=s.created_at,
                remaining_bags=remaining, remaining_kg=remaining * s.bag_weight_kg,
                total_inbound_bags=inbound, total_outbound_bags=outbound
            ))

    # Recent transactions
    recent_txs = db.query(Transaction).options(
        joinedload(Transaction.stock),
        joinedload(Transaction.warehouse),
        joinedload(Transaction.created_by_user)
    ).order_by(Transaction.created_at.desc()).limit(10).all()

    # Warehouse summaries
    warehouse_summary = []
    for w in db.query(Warehouse).filter(Warehouse.is_active == True).all():
        in_kg   = db.query(func.sum(Transaction.quantity_kg)).filter(Transaction.warehouse_id == w.id, Transaction.transaction_type == TransactionType.inbound).scalar()  or 0
        out_kg  = db.query(func.sum(Transaction.quantity_kg)).filter(Transaction.warehouse_id == w.id, Transaction.transaction_type == TransactionType.outbound).scalar() or 0
        in_bags = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.warehouse_id == w.id, Transaction.transaction_type == TransactionType.inbound).scalar()  or 0
        out_bags= db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.warehouse_id == w.id, Transaction.transaction_type == TransactionType.outbound).scalar() or 0
        stock_kg = max(0.0, in_kg - out_kg)
        bags     = max(0, in_bags - out_bags)
        pct      = (stock_kg / (w.capacity * 1000) * 100) if w.capacity > 0 else 0
        warehouse_summary.append(WarehouseWithStock(
            id=w.id, location_name=w.location_name, location_name_ta=w.location_name_ta,
            address=w.address, capacity=w.capacity, is_active=w.is_active, created_at=w.created_at,
            total_stock_kg=stock_kg, total_bags=bags, stock_percentage=min(100.0, pct)
        ))

    return DashboardSummary(
        total_warehouses=total_warehouses,
        total_stock_types=total_stocks,
        total_inbound_today=int(today_in),
        total_outbound_today=int(today_out),
        total_stock_kg=max(0.0, float(total_in_kg - total_out_kg)),
        total_bags=max(0, int(total_in_bags - total_out_bags)),
        low_stock_items=low_stock,
        recent_transactions=recent_txs,
        warehouse_summary=warehouse_summary
    )
