from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
from database import get_db
from models import Transaction, Stock, Warehouse, TransactionType, CustomQualityGrade
from schemas import TransactionCreate, TransactionOut, StockLedger, StockOut, WarehouseOut, CustomQualityGradeOut, CustomQualityGradeCreate
from utils.deps import get_current_user
from models import User

router = APIRouter()


@router.get("/quality-grades", response_model=List[CustomQualityGradeOut])
def list_custom_grades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(CustomQualityGrade).order_by(CustomQualityGrade.grade_name).all()


@router.post("/quality-grades", response_model=CustomQualityGradeOut, status_code=status.HTTP_201_CREATED)
def add_custom_grade(
    payload: CustomQualityGradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    name = payload.grade_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Grade name cannot be empty")
    existing = db.query(CustomQualityGrade).filter(CustomQualityGrade.grade_name == name).first()
    if existing:
        return existing
    grade = CustomQualityGrade(grade_name=name)
    db.add(grade)
    db.commit()
    db.refresh(grade)
    return grade


# ✅ CHANGED: "/" to ""
@router.get("", response_model=List[TransactionOut])
def list_transactions(
    warehouse_id: Optional[int] = None,
    stock_id: Optional[int] = None,
    transaction_type: Optional[TransactionType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    quality_grade: Optional[str] = None,
    vehicle_number: Optional[str] = None,
    source: Optional[str] = None,
    destination: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(Transaction).options(
        joinedload(Transaction.stock),
        joinedload(Transaction.warehouse),
        joinedload(Transaction.created_by_user)
    )
    if warehouse_id:
        q = q.filter(Transaction.warehouse_id == warehouse_id)
    if stock_id:
        q = q.filter(Transaction.stock_id == stock_id)
    if transaction_type:
        q = q.filter(Transaction.transaction_type == transaction_type)
    if date_from:
        q = q.filter(Transaction.transaction_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Transaction.transaction_date <= datetime.combine(date_to, datetime.max.time()))
    if quality_grade:
        q = q.filter(Transaction.quality_grade == quality_grade)
    if vehicle_number:
        q = q.filter(Transaction.vehicle_number.ilike(f"%{vehicle_number}%"))
    if source:
        q = q.filter(Transaction.source.ilike(f"%{source}%"))
    if destination:
        q = q.filter(Transaction.destination.ilike(f"%{destination}%"))

    return q.order_by(Transaction.transaction_date.desc()).offset(offset).limit(limit).all()


@router.get("/ledger", response_model=StockLedger)
def get_stock_ledger(
    stock_id: int,
    warehouse_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    q = db.query(Transaction).options(
        joinedload(Transaction.stock),
        joinedload(Transaction.warehouse),
        joinedload(Transaction.created_by_user)
    ).filter(
        Transaction.stock_id == stock_id,
        Transaction.warehouse_id == warehouse_id
    )
    if date_from:
        q = q.filter(Transaction.transaction_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Transaction.transaction_date <= datetime.combine(date_to, datetime.max.time()))

    transactions = q.order_by(Transaction.transaction_date.asc()).all()

    total_in = sum(t.quantity_bags for t in transactions if t.transaction_type == TransactionType.inbound)
    total_out = sum(t.quantity_bags for t in transactions if t.transaction_type == TransactionType.outbound)
    closing = total_in - total_out

    return StockLedger(
        stock=StockOut.model_validate(stock),
        warehouse=WarehouseOut.model_validate(warehouse),
        transactions=transactions,
        opening_stock=0,
        total_inbound=total_in,
        total_outbound=total_out,
        closing_stock=closing,
        closing_stock_kg=closing * stock.bag_weight_kg
    )


# ✅ CHANGED: "/" to ""
@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stock = db.query(Stock).filter(Stock.id == payload.stock_id, Stock.is_active == True).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id, Warehouse.is_active == True).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    if payload.transaction_type == TransactionType.outbound:
        total_in = db.query(func.sum(Transaction.quantity_bags)).filter(
            Transaction.stock_id == payload.stock_id,
            Transaction.warehouse_id == payload.warehouse_id,
            Transaction.transaction_type == TransactionType.inbound
        ).scalar() or 0
        total_out = db.query(func.sum(Transaction.quantity_bags)).filter(
            Transaction.stock_id == payload.stock_id,
            Transaction.warehouse_id == payload.warehouse_id,
            Transaction.transaction_type == TransactionType.outbound
        ).scalar() or 0
        available = total_in - total_out
        if payload.quantity_bags > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock. Available: {available} bags"
            )

    transaction = Transaction(
        stock_id=payload.stock_id,
        warehouse_id=payload.warehouse_id,
        transaction_type=payload.transaction_type,
        quantity_bags=payload.quantity_bags,
        quantity_kg=payload.quantity_bags * stock.bag_weight_kg,
        quality_grade=payload.quality_grade,
        source=payload.source,
        sub_source=payload.sub_source,
        destination=payload.destination,
        sub_destination=payload.sub_destination,
        vehicle_number=payload.vehicle_number,
        notes=payload.notes,
        quality_note=payload.quality_note if payload.quality_grade.value == "other" else None,
        transaction_date=payload.transaction_date,
        created_by=current_user.id
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    if payload.quality_grade.value == "other" and payload.quality_note:
        name = payload.quality_note.strip()
        if name and not db.query(CustomQualityGrade).filter(CustomQualityGrade.grade_name == name).first():
            db.add(CustomQualityGrade(grade_name=name))
            db.commit()

    return db.query(Transaction).options(
        joinedload(Transaction.stock),
        joinedload(Transaction.warehouse),
        joinedload(Transaction.created_by_user)
    ).filter(Transaction.id == transaction.id).first()


@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")

    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    return {"message": "Transaction deleted"}