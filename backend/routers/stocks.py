from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from database import get_db
from models import Stock, Transaction, TransactionType, User
from schemas import StockCreate, StockUpdate, StockOut, StockWithInventory
from utils.deps import get_current_user, require_admin

router = APIRouter()


def compute_stock_inventory(stock_id: int, db: Session) -> tuple:
    inbound  = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.stock_id == stock_id, Transaction.transaction_type == TransactionType.inbound).scalar()  or 0
    outbound = db.query(func.sum(Transaction.quantity_bags)).filter(Transaction.stock_id == stock_id, Transaction.transaction_type == TransactionType.outbound).scalar() or 0
    return inbound, outbound, inbound - outbound


def _stock_with_inv(s: Stock, db: Session) -> StockWithInventory:
    inbound, outbound, remaining = compute_stock_inventory(s.id, db)
    return StockWithInventory(
        id=s.id, brand_name=s.brand_name, brand_name_ta=s.brand_name_ta,
        rice_type=s.rice_type, rice_type_ta=s.rice_type_ta,
        production_company=s.production_company,
        production_company_ta=s.production_company_ta,
        bag_weight_kg=s.bag_weight_kg,
        is_active=s.is_active, created_at=s.created_at,
        remaining_bags=max(0, remaining),
        remaining_kg=max(0.0, remaining * s.bag_weight_kg),
        total_inbound_bags=inbound,
        total_outbound_bags=outbound
    )


@router.get("/", response_model=List[StockWithInventory])
def list_stocks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_stock_with_inv(s, db) for s in db.query(Stock).filter(Stock.is_active == True).all()]


@router.get("/{stock_id}", response_model=StockWithInventory)
def get_stock(stock_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(Stock).filter(Stock.id == stock_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Stock not found")
    return _stock_with_inv(s, db)


@router.post("/", response_model=StockOut, status_code=status.HTTP_201_CREATED)
def create_stock(payload: StockCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    stock = Stock(**payload.model_dump())
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


@router.put("/{stock_id}", response_model=StockOut)
def update_stock(stock_id: int, payload: StockUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(stock, field, value)
    db.commit()
    db.refresh(stock)
    return stock


@router.delete("/{stock_id}")
def delete_stock(stock_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    stock.is_active = False
    db.commit()
    return {"message": "Stock deactivated"}
