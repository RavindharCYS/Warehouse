from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from database import get_db
from models import Warehouse, Transaction, TransactionType, Stock, User
from schemas import WarehouseCreate, WarehouseUpdate, WarehouseOut, WarehouseWithStock, StockWithInventory
from utils.deps import get_current_user, require_admin

router = APIRouter()


def compute_warehouse_stock(warehouse_id: int, db: Session) -> tuple:
    inbound = db.query(func.sum(Transaction.quantity_kg), func.sum(Transaction.quantity_bags)).filter(
        Transaction.warehouse_id == warehouse_id,
        Transaction.transaction_type == TransactionType.inbound
    ).first()
    outbound = db.query(func.sum(Transaction.quantity_kg), func.sum(Transaction.quantity_bags)).filter(
        Transaction.warehouse_id == warehouse_id,
        Transaction.transaction_type == TransactionType.outbound
    ).first()
    in_kg    = inbound[0]  or 0.0
    in_bags  = inbound[1]  or 0
    out_kg   = outbound[0] or 0.0
    out_bags = outbound[1] or 0
    return (in_kg - out_kg, in_bags - out_bags)


def _wh_with_stock(w: Warehouse, db: Session) -> WarehouseWithStock:
    stock_kg, bags = compute_warehouse_stock(w.id, db)
    pct = (stock_kg / (w.capacity * 1000) * 100) if w.capacity > 0 else 0
    return WarehouseWithStock(
        id=w.id, location_name=w.location_name, location_name_ta=w.location_name_ta,
        address=w.address, capacity=w.capacity, is_active=w.is_active, created_at=w.created_at,
        total_stock_kg=max(0.0, stock_kg),
        total_bags=max(0, bags),
        stock_percentage=min(100.0, max(0.0, pct))
    )


# ✅ CHANGED: "/" to ""
@router.get("", response_model=List[WarehouseWithStock])
def list_warehouses(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_wh_with_stock(w, db) for w in db.query(Warehouse).filter(Warehouse.is_active == True).all()]


@router.get("/{warehouse_id}", response_model=WarehouseWithStock)
def get_warehouse(warehouse_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    w = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return _wh_with_stock(w, db)


@router.get("/{warehouse_id}/stocks")
def get_warehouse_stocks(warehouse_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    w = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    stock_ids = db.query(Transaction.stock_id).filter(
        Transaction.warehouse_id == warehouse_id
    ).distinct().all()
    stock_ids = [s[0] for s in stock_ids]

    result = []
    for stock in db.query(Stock).filter(Stock.id.in_(stock_ids)).all():
        inbound = db.query(func.sum(Transaction.quantity_bags)).filter(
            Transaction.warehouse_id == warehouse_id,
            Transaction.stock_id == stock.id,
            Transaction.transaction_type == TransactionType.inbound
        ).scalar() or 0
        outbound = db.query(func.sum(Transaction.quantity_bags)).filter(
            Transaction.warehouse_id == warehouse_id,
            Transaction.stock_id == stock.id,
            Transaction.transaction_type == TransactionType.outbound
        ).scalar() or 0
        remaining = max(0, inbound - outbound)
        result.append({
            "stock_id": stock.id,
            "brand_name": stock.brand_name,
            "brand_name_ta": stock.brand_name_ta,
            "rice_type": stock.rice_type,
            "rice_type_ta": stock.rice_type_ta,
            "bag_weight_kg": stock.bag_weight_kg,
            "total_inbound_bags": inbound,
            "total_outbound_bags": outbound,
            "remaining_bags": remaining,
            "remaining_kg": remaining * stock.bag_weight_kg,
        })

    result.sort(key=lambda x: x["remaining_bags"], reverse=True)
    return result


# ✅ CHANGED: "/" to ""
@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(payload: WarehouseCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.query(Warehouse).filter(Warehouse.location_name == payload.location_name).first():
        raise HTTPException(status_code=400, detail="Warehouse name already exists")
    warehouse = Warehouse(**payload.model_dump())
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(warehouse_id: int, payload: WarehouseUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(warehouse, field, value)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.delete("/{warehouse_id}")
def delete_warehouse(warehouse_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    warehouse.is_active = False
    db.commit()
    return {"message": "Warehouse deactivated"}