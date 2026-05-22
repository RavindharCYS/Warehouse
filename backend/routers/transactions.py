# backend/routers/transactions.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_, or_
from typing import List, Optional
from datetime import datetime, date
import uuid

from database import get_db
from models import (
    Transaction, TransactionItem, TransactionItemWeight, TransactionItemSplit,
    Stock, StockWeightBreakdown,
    Warehouse, Brand, RiceType, MillOwner,
    TransactionType, ApprovalStatus, CustomQualityGrade,
    User, UserRole,
)
from schemas import (
    TransactionOut, StockLedger, StockOut, WarehouseOut,
    CustomQualityGradeOut, CustomQualityGradeCreate,
    ArrivalCreate, SendCreate,
    AdminInboundFields, AdminOutboundFields,
    ProfitLossOut, TransactionCreate, ArrivalItemEntry,
)
from utils.deps import get_current_user

router = APIRouter()

# ============================================================
# CONSTANTS / HELPERS
# ============================================================
VALID_BAG_SIZES = (25.0, 26.0)
PIECE_THRESHOLD_KG = 25.0   # weight < this → piece (loose), else → bag


def _ensure_admin(user: User):
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")


def _calc_total_kg(weights: List[dict]) -> float:
    """Sum of weight x quantity across rows."""
    return sum(float(w["weight"]) * int(w["quantity"]) for w in weights)


def _calc_units_from_rows(weights: List[dict]):
    """
    NEW UNIT LOGIC — matches frontend calcArrivalEntries():
    - weight >= 25 kg → 1 BAG per qty
    - weight <  25 kg → 1 PIECE per qty
    Total units = bags + pieces (each row contributes its own qty).

    Returns:
        (total_units, total_bag_units, total_piece_units, error_or_None)
    """
    total_bag_units = 0
    total_piece_units = 0

    for w in weights:
        try:
            wt = float(w["weight"])
            qty = int(w["quantity"])
        except (KeyError, TypeError, ValueError):
            return 0, 0, 0, "Invalid weight or quantity in entries"

        if wt <= 0 or qty <= 0:
            continue

        if wt >= PIECE_THRESHOLD_KG:
            total_bag_units += qty
        else:
            total_piece_units += qty

    total_units = total_bag_units + total_piece_units
    return total_units, total_bag_units, total_piece_units, None


# ── Legacy helper kept for backward compat — DEPRECATED ──
def _calc_bags(total_kg: float, bag_size: float):
    if bag_size not in VALID_BAG_SIZES:
        raise HTTPException(
            status_code=400,
            detail=f"bag_size must be one of {VALID_BAG_SIZES}"
        )
    bags = int(total_kg // bag_size)
    remainder = round(total_kg - bags * bag_size, 4)
    return bags, remainder


def _calc_bags_from_rows(weights: List[dict], bag_size: float):
    """
    DEPRECATED — kept for backward compat with /transactions (legacy endpoint).
    Use _calc_units_from_rows for the new unit-counting logic.
    """
    total_units, _, _, err = _calc_units_from_rows(weights)
    if err:
        return 0, 0.0, err
    return total_units, 0.0, None


def _load_full_transaction(db: Session, tx_id: int) -> Transaction:
    """Eager-load a transaction with all relationships for response."""
    return (
        db.query(Transaction)
        .options(
            joinedload(Transaction.items)
            .joinedload(TransactionItem.brand),
            joinedload(Transaction.items)
            .joinedload(TransactionItem.rice_type_ref),
            joinedload(Transaction.items)
            .joinedload(TransactionItem.warehouse),
            joinedload(Transaction.items)
            .joinedload(TransactionItem.weights),
            joinedload(Transaction.items)
            .joinedload(TransactionItem.splits)
            .joinedload(TransactionItemSplit.warehouse),
            joinedload(Transaction.mill_owner),
            joinedload(Transaction.created_by_user),
            joinedload(Transaction.completed_by_user),
        )
        .filter(Transaction.id == tx_id)
        .first()
    )


def _get_or_create_stock(
    db: Session,
    brand_id: int,
    rice_type_id: Optional[int],
    warehouse_id: int,
    bag_size: float,
) -> Stock:
    """Fetch existing stock row or create one for this combo."""
    stock = (
        db.query(Stock)
        .filter(
            Stock.brand_id == brand_id,
            Stock.rice_type_id == rice_type_id,
            Stock.warehouse_id == warehouse_id,
            Stock.bag_weight_kg == bag_size,
        )
        .first()
    )
    if stock:
        return stock

    brand = db.query(Brand).filter(Brand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail=f"Brand {brand_id} not found")

    rice_type_obj = None
    if rice_type_id:
        rice_type_obj = db.query(RiceType).filter(RiceType.id == rice_type_id).first()
        if not rice_type_obj:
            raise HTTPException(status_code=404, detail=f"RiceType {rice_type_id} not found")

    stock = Stock(
        brand_id=brand_id,
        rice_type_id=rice_type_id,
        warehouse_id=warehouse_id,
        bag_weight_kg=bag_size,
        brand_name=brand.name,
        brand_name_ta=brand.name_ta,
        rice_type=rice_type_obj.name if rice_type_obj else None,
        rice_type_ta=rice_type_obj.name_ta if rice_type_obj else None,
        total_bags=0,
        total_weight_kg=0.0,
    )
    db.add(stock)
    db.flush()
    return stock


def _apply_inbound_to_stock(
    db: Session,
    brand_id: int,
    rice_type_id: Optional[int],
    warehouse_id: int,
    bag_size: float,
    units: int,
    weight_kg: float,
    weight_breakdown: List[dict],
):
    """
    Increment stock totals and weight breakdown rows.
    `units` here = total bags + pieces for this split (matches frontend).
    """
    stock = _get_or_create_stock(db, brand_id, rice_type_id, warehouse_id, bag_size)
    stock.total_bags = (stock.total_bags or 0) + units
    stock.total_weight_kg = (stock.total_weight_kg or 0.0) + weight_kg

    # Update weight breakdown — preserves bag vs piece info
    for w in weight_breakdown:
        wt = float(w["weight"])
        qty = int(w["quantity"])
        if qty <= 0:
            continue
        bd = (
            db.query(StockWeightBreakdown)
            .filter(
                StockWeightBreakdown.stock_id == stock.id,
                StockWeightBreakdown.weight_kg == wt,
            )
            .first()
        )
        if bd:
            bd.quantity = (bd.quantity or 0) + qty
        else:
            db.add(StockWeightBreakdown(stock_id=stock.id, weight_kg=wt, quantity=qty))


def _apply_outbound_to_stock(
    db: Session,
    brand_id: int,
    warehouse_id: int,
    bag_size: float,
    bags: int,
    weight_kg: float,
    rice_type_id: Optional[int] = None,
):
    """
    Decrement stock totals and weight_breakdowns.

    BUG FIX: Previously the stock lookup was too loose — it matched any stock
    row for brand+warehouse without filtering by rice_type_id, so if a brand
    had multiple rice types it could pick the wrong row.  Also, the weight
    breakdown deduction used `weight_kg` (total kg of the outbound) instead of
    `bag_size` (the unit weight being sent), so the breakdown counter was never
    decremented properly.
    """
    # Build the base query — always filter by brand + warehouse
    q = (
        db.query(Stock)
        .filter(
            Stock.brand_id == brand_id,
            Stock.warehouse_id == warehouse_id,
            Stock.bag_weight_kg == bag_size,
        )
    )
    # Also filter by rice_type_id when provided (prevents wrong-row match)
    if rice_type_id is not None:
        q = q.filter(Stock.rice_type_id == rice_type_id)

    stock = q.first()

    # Fallback: try without bag_size filter (legacy rows may have different bag_weight_kg)
    if not stock:
        fallback_q = db.query(Stock).filter(
            Stock.brand_id == brand_id,
            Stock.warehouse_id == warehouse_id,
            Stock.is_active == True,
        )
        if rice_type_id is not None:
            fallback_q = fallback_q.filter(Stock.rice_type_id == rice_type_id)
        stock = fallback_q.first()

    if not stock or (stock.total_bags or 0) < bags:
        available = stock.total_bags if stock else 0
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock for brand {brand_id} ({bag_size}KG) "
                f"in warehouse {warehouse_id}. "
                f"Requested {bags}, available {available}."
            ),
        )

    stock.total_bags = max(0, (stock.total_bags or 0) - bags)
    stock.total_weight_kg = max(0.0, (stock.total_weight_kg or 0.0) - weight_kg)

    # Decrement the matching weight breakdown row.
    # KEY FIX: match on bag_size (unit weight), NOT on the total weight_kg of
    # the outbound.  Previously this used `weight_kg` which is bags × bag_size,
    # so the breakdown was never found and the breakdown counter never went down.
    breakdown = (
        db.query(StockWeightBreakdown)
        .filter(
            StockWeightBreakdown.stock_id == stock.id,
            StockWeightBreakdown.weight_kg == bag_size,
        )
        .first()
    )
    if breakdown:
        breakdown.quantity = max(0, (breakdown.quantity or 0) - bags)


def _compute_profit_loss(price: Optional[float], sell_price: Optional[float], bags: int) -> Optional[float]:
    if price is None or sell_price is None:
        return None
    return round((float(sell_price) - float(price)) * int(bags), 2)


# ============================================================
# CUSTOM QUALITY GRADES
# ============================================================
@router.get("/quality-grades", response_model=List[CustomQualityGradeOut])
def list_custom_grades(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(CustomQualityGrade).order_by(CustomQualityGrade.grade_name).all()


@router.post("/quality-grades", response_model=CustomQualityGradeOut, status_code=status.HTTP_201_CREATED)
def add_custom_grade(
    payload: CustomQualityGradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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


# ============================================================
# LIST TRANSACTIONS  (with filters)
# ============================================================
@router.get("", response_model=List[TransactionOut])
def list_transactions(
    transaction_type: Optional[TransactionType] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    vehicle_no: Optional[str] = Query(None, alias="vehicle_no"),
    vehicle_number: Optional[str] = None,
    driver_name: Optional[str] = None,
    mill_owner_name: Optional[str] = None,
    brand_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    source: Optional[str] = None,
    destination: Optional[str] = None,
    filter: Optional[str] = Query(None, description="'pending' to fetch admin-pending only"),
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Transaction).options(
        joinedload(Transaction.items).joinedload(TransactionItem.brand),
        joinedload(Transaction.items).joinedload(TransactionItem.rice_type_ref),
        joinedload(Transaction.items).joinedload(TransactionItem.warehouse),
        joinedload(Transaction.items).joinedload(TransactionItem.weights),
        joinedload(Transaction.items).joinedload(TransactionItem.splits),
        joinedload(Transaction.mill_owner),
        joinedload(Transaction.created_by_user),
    )

    if transaction_type:
        q = q.filter(Transaction.transaction_type == transaction_type)
    if date_from:
        q = q.filter(Transaction.transaction_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Transaction.transaction_date <= datetime.combine(date_to, datetime.max.time()))

    veh = vehicle_no or vehicle_number
    if veh:
        q = q.filter(Transaction.vehicle_number.ilike(f"%{veh}%"))
    if driver_name:
        q = q.filter(Transaction.driver_name.ilike(f"%{driver_name}%"))
    if mill_owner_name:
        q = q.filter(Transaction.mill_owner_name.ilike(f"%{mill_owner_name}%"))
    if source:
        q = q.filter(Transaction.source.ilike(f"%{source}%"))
    if destination:
        q = q.filter(Transaction.destination.ilike(f"%{destination}%"))

    if brand_id or warehouse_id:
        q = q.join(Transaction.items)
        if brand_id:
            q = q.filter(TransactionItem.brand_id == brand_id)
        if warehouse_id:
            q = q.filter(
                or_(
                    TransactionItem.warehouse_id == warehouse_id,
                    TransactionItem.splits.any(TransactionItemSplit.warehouse_id == warehouse_id),
                )
            )

    if filter == "pending":
        q = q.filter(Transaction.admin_pending == True)  # noqa: E712

    transactions = (
        q.order_by(Transaction.transaction_date.desc())
        .distinct()
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    return [TransactionOut.model_validate(tx) for tx in transactions]


# ============================================================
# LEDGER
# ============================================================
# FIX B1/B4: /ledger must be declared BEFORE /{transaction_id} so FastAPI
# does not match the literal string "ledger" as a transaction_id integer.
@router.get("/ledger", response_model=StockLedger)
def get_stock_ledger(
    stock_id: int,
    warehouse_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    q = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.items),
            joinedload(Transaction.created_by_user),
        )
        .join(Transaction.items)
        .filter(
            TransactionItem.brand_id == stock.brand_id,
            or_(
                TransactionItem.warehouse_id == warehouse_id,
                TransactionItem.splits.any(TransactionItemSplit.warehouse_id == warehouse_id),
            ),
            TransactionItem.bag_size_kg == stock.bag_weight_kg,
        )
    )
    if date_from:
        q = q.filter(Transaction.transaction_date >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(Transaction.transaction_date <= datetime.combine(date_to, datetime.max.time()))

    transactions = q.order_by(Transaction.transaction_date.asc()).distinct().all()

    total_in = sum(t.total_bags or 0 for t in transactions if t.transaction_type == TransactionType.inbound)
    total_out = sum(t.total_bags or 0 for t in transactions if t.transaction_type == TransactionType.outbound)
    closing = total_in - total_out

    return StockLedger(
        stock=StockOut.model_validate(stock),
        warehouse=WarehouseOut.model_validate(warehouse),
        transactions=transactions,
        opening_stock=0,
        total_inbound=total_in,
        total_outbound=total_out,
        closing_stock=closing,
        closing_stock_kg=closing * (stock.bag_weight_kg or 25),
    )


# ============================================================
# GET SINGLE TRANSACTION
# ============================================================
@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = _load_full_transaction(db, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


# ============================================================
# CREATE ARRIVAL  (multi-item, NEW unit logic)
# ============================================================
@router.post("/arrival", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_arrival(
    payload: ArrivalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    if not payload.vehicle_no:
        raise HTTPException(status_code=400, detail="Vehicle number is required")
    if not payload.driver_name:
        raise HTTPException(status_code=400, detail="Driver name is required")
    if not payload.driver_number:
        raise HTTPException(status_code=400, detail="Driver number is required")

    is_admin = current_user.role == UserRole.admin

    # Build header
    txn = Transaction(
        transaction_type=TransactionType.inbound,
        transaction_date=payload.transaction_date or datetime.utcnow(),
        vehicle_number=payload.vehicle_no,
        driver_name=payload.driver_name,
        driver_number=payload.driver_number,
        source=payload.source,
        commission_partner=payload.commission_partner,
        notes=payload.notes,
        load_group_id=str(uuid.uuid4()),
        created_by=current_user.id,
        total_bags=0,
        total_weight_kg=0.0,
    )

    # Admin-only fields
    if is_admin:
        if payload.mill_owner_id:
            mo = db.query(MillOwner).filter(MillOwner.id == payload.mill_owner_id).first()
            if not mo:
                raise HTTPException(status_code=404, detail="Mill Owner not found")
            txn.mill_owner_id = mo.id
            txn.mill_owner_name = mo.name
        elif payload.mill_owner_name:
            txn.mill_owner_name = payload.mill_owner_name
        txn.price = payload.price
        txn.rent = payload.rent
        txn.hidden_charges = payload.hidden_charges

    # Determine approval status
    # Admin must always fill pricing. If they skip it, transaction stays pending
    # so it shows on the dashboard until they come back and complete it.
    # Always start as pending — completion checked after items/weights saved below
    txn.admin_pending = True
    txn.approval_status = ApprovalStatus.pending

    db.add(txn)
    db.flush()

    grand_units = 0
    grand_kg = 0.0

    for idx, item in enumerate(payload.items, start=1):
        # Validate brand & rice type
        brand = db.query(Brand).filter(Brand.id == item.brand_id).first()
        if not brand:
            raise HTTPException(status_code=404, detail=f"Item {idx}: Brand {item.brand_id} not found")

        if item.rice_type_id:
            rt = db.query(RiceType).filter(RiceType.id == item.rice_type_id).first()
            if not rt:
                raise HTTPException(status_code=404, detail=f"Item {idx}: RiceType {item.rice_type_id} not found")

        # Bag size validation
        bag_size = float(item.bag_size or 25.0)
        if bag_size not in VALID_BAG_SIZES:
            raise HTTPException(status_code=400, detail=f"Item {idx}: bag_size must be 25 or 26")

        # ── Choose processing path ────────────────────────────────────────────────
        # NEW PATH  : item.entries is present — each row carries its own warehouse_id.
        #             Stock is applied with exact quantities; no proportional math.
        # LEGACY PATH: item.weights + item.warehouse_splits — kept for backward
        #             compatibility with older clients that do not send entries[].
        use_entries = bool(item.entries)

        if use_entries:
            # ── NEW PATH: per-row entries with explicit warehouse_id ─────────────
            from collections import defaultdict

            # Validate all warehouses up front (one query per unique warehouse)
            seen_wh_ids = {e.warehouse_id for e in item.entries}
            for wh_id in seen_wh_ids:
                wh = db.query(Warehouse).filter(
                    Warehouse.id == wh_id,
                    Warehouse.is_active == True
                ).first()
                if not wh:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Item {idx}: Warehouse {wh_id} not found"
                    )

            # Aggregate all entries for item-level totals
            weights_data = [{"weight": float(e.weight), "quantity": int(e.quantity)} for e in item.entries]
            total_kg = _calc_total_kg(weights_data)
            total_units, total_bag_units, total_piece_units, unit_err = _calc_units_from_rows(weights_data)
            if unit_err:
                raise HTTPException(status_code=400, detail=f"Item {idx}: {unit_err}")
            if total_units == 0:
                raise HTTPException(status_code=400, detail=f"Item {idx}: No valid entries (need weight > 0 and qty > 0)")

            # Create item header
            ti = TransactionItem(
                transaction_id=txn.id,
                brand_id=item.brand_id,
                rice_type_id=item.rice_type_id,
                bag_size_kg=bag_size,
                total_bags=total_units,
                total_weight_kg=total_kg,
            )
            
            if is_admin:
                if item.buying_price is not None:
                    ti.buying_price = item.buying_price
            
                elif payload.price is not None:
                    ti.buying_price = payload.price
            
                else:
                    row_prices = [
                        e.buying_price
                        for e in item.entries
                        if e.buying_price is not None
                    ]
            
                    if row_prices:
                        unique = set(row_prices)
                        if len(unique) == 1:
                            ti.buying_price = row_prices[0]

                # margin_price: item-level wins; fall back to aggregated row-level
                if item.margin_price is not None:
                    ti.margin_price = item.margin_price
                else:
                    row_margins = [
                        e.margin_price
                        for e in item.entries
                        if e.margin_price is not None
                    ]
                    if row_margins:
                        unique_m = set(row_margins)
                        if len(unique_m) == 1:
                            ti.margin_price = row_margins[0]
                        else:
                            # weighted average when rows differ
                            total_qty = sum(int(e.quantity) for e in item.entries if e.margin_price is not None)
                            if total_qty:
                                ti.margin_price = round(
                                    sum(e.margin_price * int(e.quantity) for e in item.entries if e.margin_price is not None)
                                    / total_qty, 4
                                )
            
            db.add(ti)
            db.flush()

            # Save aggregated weight rows (collapsed by weight value) for display
            weight_agg: dict = {}
            weight_price_agg: dict = {}
            for e in item.entries:
                wt = float(e.weight)
                weight_agg[wt] = weight_agg.get(wt, 0) + int(e.quantity)
                if is_admin and e.buying_price is not None:
                    weight_price_agg[wt] = float(e.buying_price)
            for wt, qty in weight_agg.items():
                db.add(TransactionItemWeight(
                    item_id=ti.id,
                    weight_kg=wt,
                    quantity=qty,
                    buying_price=weight_price_agg.get(wt) if is_admin else None,
                ))

            # Group entries by warehouse — exact quantities, zero rounding error
            wh_rows: dict = defaultdict(list)
            for e in item.entries:
                wh_rows[e.warehouse_id].append({
                    "weight": float(e.weight),
                    "quantity": int(e.quantity),
                })

            for wh_id, rows in wh_rows.items():
                split_units, _, _, _ = _calc_units_from_rows(rows)
                split_weight = round(_calc_total_kg(rows), 4)

                db.add(TransactionItemSplit(
                    item_id=ti.id,
                    warehouse_id=wh_id,
                    bags=split_units,
                    weight_kg=split_weight,
                ))

                # Use the exact rows for this warehouse — no proportional scaling
                _apply_inbound_to_stock(
                    db,
                    brand_id=item.brand_id,
                    rice_type_id=item.rice_type_id,
                    warehouse_id=wh_id,
                    bag_size=bag_size,
                    units=split_units,
                    weight_kg=split_weight,
                    weight_breakdown=rows,
                )

        else:
            # ── LEGACY PATH: flat weights[] + warehouse_splits[] ─────────────────
            # Kept for backward compatibility. Uses proportional allocation which
            # may introduce rounding drift for mixed bag/piece items, but existing
            # integrations that omit entries[] are not broken.
            weights_data = [{"weight": w.weight, "quantity": w.quantity} for w in (item.weights or [])]
            if not weights_data:
                raise HTTPException(status_code=400, detail=f"Item {idx}: At least one weight row is required")

            total_kg = _calc_total_kg(weights_data)
            total_units, total_bag_units, total_piece_units, unit_err = _calc_units_from_rows(weights_data)
            if unit_err:
                raise HTTPException(status_code=400, detail=f"Item {idx}: {unit_err}")
            if total_units == 0:
                raise HTTPException(status_code=400, detail=f"Item {idx}: No valid entries (need weight > 0 and qty > 0)")

            if not item.warehouse_splits:
                raise HTTPException(status_code=400, detail=f"Item {idx}: warehouse_splits required")

            split_total = sum(int(s.bags) for s in item.warehouse_splits)
            if split_total != total_units:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Item {idx}: Warehouse split sum ({split_total}) "
                        f"≠ total units ({total_units} = {total_bag_units} bags + {total_piece_units} pieces)"
                    )
                )

            # Create item header
            ti = TransactionItem(
                transaction_id=txn.id,
                brand_id=item.brand_id,
                rice_type_id=item.rice_type_id,
                bag_size_kg=bag_size,
                total_bags=total_units,
                total_weight_kg=total_kg,
            )
            
            if is_admin:
                if item.buying_price is not None:
                    ti.buying_price = item.buying_price
            
                elif payload.price is not None:
                    ti.buying_price = payload.price
            
                else:
                    row_prices = [
                        w.buying_price
                        for w in item.weights
                        if w.buying_price is not None
                    ]
            
                    if row_prices:
                        unique = set(row_prices)
                        if len(unique) == 1:
                            ti.buying_price = row_prices[0]

                # margin_price: item-level wins
                if item.margin_price is not None:
                    ti.margin_price = item.margin_price
                            
            db.add(ti)
            db.flush()

            for w in item.weights:
                db.add(TransactionItemWeight(
                    item_id=ti.id,
                    weight_kg=float(w.weight),
                    quantity=int(w.quantity),
                    buying_price=float(w.buying_price) if (is_admin and w.buying_price is not None) else None,
                ))

            for s in item.warehouse_splits:
                wh = db.query(Warehouse).filter(
                    Warehouse.id == s.warehouse_id,
                    Warehouse.is_active == True
                ).first()
                if not wh:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Item {idx}: Warehouse {s.warehouse_id} not found"
                    )

                split_units = int(s.bags)
                split_weight = round((split_units / total_units) * total_kg, 4) if total_units else 0.0

                db.add(TransactionItemSplit(
                    item_id=ti.id,
                    warehouse_id=s.warehouse_id,
                    bags=split_units,
                    weight_kg=split_weight,
                ))

                split_breakdown = [
                    {
                        "weight": w["weight"],
                        "quantity": int(round((split_units / total_units) * w["quantity"]))
                        if total_units else 0
                    }
                    for w in weights_data
                ]

                _apply_inbound_to_stock(
                    db,
                    brand_id=item.brand_id,
                    rice_type_id=item.rice_type_id,
                    warehouse_id=s.warehouse_id,
                    bag_size=bag_size,
                    units=split_units,
                    weight_kg=split_weight,
                    weight_breakdown=split_breakdown,
                )

        grand_units += total_units
        grand_kg += total_kg

    txn.total_bags = grand_units
    txn.total_weight_kg = grand_kg

    # ── BUG FIX: Completion check for admin arrivals ──────────────────────────
    # We must check using the in-memory item/weight objects built above (before
    # commit) rather than re-querying, because SQLite/Postgres may not see the
    # freshly flushed rows reliably via a new query in the same transaction.
    # A transaction is "complete" when EVERY weight row has a buying_price
    # (weight-level price takes priority; item-level price is an acceptable
    # fallback).  At least one weight row must exist — an empty set is not
    # considered fully-priced (guard against accidental auto-complete).
    if is_admin:
        db.flush()  # push pending INSERTs so IDs are available

        # Re-query after flush so we get committed-in-session state
        all_weight_rows = (
            db.query(TransactionItemWeight)
            .join(TransactionItem, TransactionItem.id == TransactionItemWeight.item_id)
            .filter(TransactionItem.transaction_id == txn.id)
            .all()
        )
        all_items_by_id = {
            it.id: it
            for it in db.query(TransactionItem)
            .filter(TransactionItem.transaction_id == txn.id)
            .all()
        }

        def _weight_row_is_priced(w: TransactionItemWeight) -> bool:
            # weight-level price wins
            if w.buying_price is not None:
                return True
            # fall back to item-level price set at arrival time
            parent = all_items_by_id.get(w.item_id)
            return parent is not None and parent.buying_price is not None

        # Only mark complete when:
        #   1. All weight rows have a buying price, AND
        #   2. mill_owner_name is filled, AND
        #   3. rent is filled (not None), AND
        #   4. hidden_charges is filled (not None)
        # Any missing field keeps the transaction pending.
        all_prices_filled = bool(all_weight_rows) and all(_weight_row_is_priced(w) for w in all_weight_rows)
        all_admin_fields_filled = (
            bool(txn.mill_owner_name and txn.mill_owner_name.strip()) and
            txn.rent is not None and
            txn.hidden_charges is not None
        )

        if all_prices_filled and all_admin_fields_filled:
            txn.admin_pending = False
            txn.approval_status = ApprovalStatus.completed
            txn.completed_by = current_user.id
            txn.completed_at = datetime.utcnow()
        else:
            txn.admin_pending = True
            txn.approval_status = ApprovalStatus.pending

    db.commit()
    return _load_full_transaction(db, txn.id)


# ============================================================
# CREATE SEND  (multi-item)
# ============================================================
@router.post("/send", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_send(
    payload: SendCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    if not payload.vehicle_no or not payload.driver_name or not payload.driver_number:
        raise HTTPException(
            status_code=400,
            detail="Vehicle number, driver name & driver number are required"
        )

    is_admin = current_user.role == UserRole.admin

    txn = Transaction(
        transaction_type=TransactionType.outbound,
        transaction_date=payload.transaction_date or datetime.utcnow(),
        vehicle_number=payload.vehicle_no,
        driver_name=payload.driver_name,
        driver_number=payload.driver_number,
        destination=payload.destination,
        commission_partner=payload.commission_partner,
        notes=payload.notes,
        load_group_id=str(uuid.uuid4()),
        created_by=current_user.id,
        total_bags=0,
        total_weight_kg=0.0,
    )

    if is_admin:
        txn.location = payload.location

    # Always start pending — completion set after items saved
    txn.admin_pending = True
    txn.approval_status = ApprovalStatus.pending

    db.add(txn)
    db.flush()

    grand_bags = 0
    grand_kg = 0.0

    for idx, item in enumerate(payload.items, start=1):
        brand = db.query(Brand).filter(Brand.id == item.brand_id).first()
        if not brand:
            raise HTTPException(status_code=404, detail=f"Item {idx}: Brand not found")
        wh = db.query(Warehouse).filter(
            Warehouse.id == item.warehouse_id,
            Warehouse.is_active == True
        ).first()
        if not wh:
            raise HTTPException(status_code=404, detail=f"Item {idx}: Warehouse not found")

        bag_size = float(item.bag_weight_kg)
        if bag_size <= 0:
            raise HTTPException(status_code=400, detail=f"Item {idx}: bag_weight_kg must be > 0")

        bags = int(item.bags)
        weight_kg = bags * bag_size

        # Decrement stock (also validates availability)
        # Pass rice_type_id so the correct stock row is decremented when a brand
        # has multiple rice types in the same warehouse.
        _apply_outbound_to_stock(
            db,
            brand_id=item.brand_id,
            warehouse_id=item.warehouse_id,
            bag_size=bag_size,
            bags=bags,
            weight_kg=weight_kg,
            rice_type_id=getattr(item, "rice_type_id", None),
        )

        ti = TransactionItem(
            transaction_id=txn.id,
            brand_id=item.brand_id,
            rice_type_id=getattr(item, "rice_type_id", None),
            bag_size_kg=bag_size,
            total_bags=bags,
            total_weight_kg=weight_kg,
            warehouse_id=item.warehouse_id,
        )

        # Per-item selling price
        if is_admin and getattr(item, "selling_price", None) is not None:
            ti.selling_price = item.selling_price

        # Per-item margin price (admin-controlled internal cost for P&L)
        if is_admin and getattr(item, "margin_price", None) is not None:
            ti.margin_price = item.margin_price

        # ============================================================
        # FIX: Auto inherit latest inbound buying price
        # ============================================================
        latest_inbound_item = (
            db.query(TransactionItem)
            .join(Transaction)
            .filter(
                Transaction.transaction_type == TransactionType.inbound,
                TransactionItem.brand_id == item.brand_id,
                TransactionItem.buying_price.isnot(None),
            )
        )

        # Match rice type if available
        if getattr(item, "rice_type_id", None) is not None:
            latest_inbound_item = latest_inbound_item.filter(
                TransactionItem.rice_type_id == getattr(item, "rice_type_id", None)
            )

        latest_inbound_item = (
            latest_inbound_item
            .order_by(Transaction.transaction_date.desc())
            .first()
        )

        if latest_inbound_item and latest_inbound_item.buying_price is not None:
            ti.buying_price = latest_inbound_item.buying_price

        db.add(ti)
        db.flush()

        db.add(TransactionItemWeight(
            item_id=ti.id,
            weight_kg=bag_size,
            quantity=bags,
        ))

        grand_bags += bags
        grand_kg += weight_kg

    txn.total_bags = grand_bags
    txn.total_weight_kg = grand_kg

    # Compute profit/loss snapshot
    if is_admin and payload.items:
        first = payload.items[0]
        last_in = (
            db.query(Transaction)
            .filter(
                Transaction.transaction_type == TransactionType.inbound,
                Transaction.price.isnot(None),
            )
            .join(Transaction.items)
            .filter(TransactionItem.brand_id == first.brand_id)
            .order_by(Transaction.transaction_date.desc())
            .first()
        )
        if last_in and last_in.price is not None:
            txn.price = last_in.price

    # Check if ALL send items have selling_price — if so mark complete, compute P&L
    if is_admin:
        db.flush()
        all_items = db.query(TransactionItem).filter(
            TransactionItem.transaction_id == txn.id
        ).all()
        all_sell_priced = all(it.selling_price is not None for it in all_items) if all_items else False
        if all_sell_priced:
            # Compute weighted avg sell_price
            total_val  = sum((it.selling_price or 0) * (it.total_bags or 0) for it in all_items)
            total_qty  = sum(it.total_bags or 0 for it in all_items)
            txn.sell_price = round(total_val / total_qty, 4) if total_qty else None

            # Compute transaction-level margin_price as weighted average of item margin prices
            # Falls back to buying_price if margin_price not set
            margin_items = [(it.margin_price or it.buying_price or txn.price or 0, it.total_bags or 0) for it in all_items]
            total_margin_val = sum(p * q for p, q in margin_items)
            txn.margin_price = round(total_margin_val / total_qty, 4) if total_qty else None

            # Compute P&L using margin_price fallback chain: item.margin_price → txn.margin_price → item.buying_price → txn.price
            total_effective_cost = sum(
                (it.margin_price or txn.margin_price or it.buying_price or txn.price or 0) * (it.total_bags or 0)
                for it in all_items
            )
            total_sell_val = sum((it.selling_price or 0) * (it.total_bags or 0) for it in all_items)
            if grand_bags:
                txn.profit_loss = round((total_sell_val - total_effective_cost) / grand_bags, 4)

            txn.admin_pending = False
            txn.approval_status = ApprovalStatus.completed
            txn.completed_by = current_user.id
            txn.completed_at = datetime.utcnow()

    db.commit()
    return _load_full_transaction(db, txn.id)


# ============================================================
# ADMIN COMPLETE PENDING FIELDS
# ============================================================
@router.patch("/{transaction_id}/admin-fields", response_model=TransactionOut)
def complete_admin_fields(
    transaction_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.transaction_type == TransactionType.inbound:
        if "mill_owner_id" in payload and payload["mill_owner_id"]:
            mo = db.query(MillOwner).filter(MillOwner.id == payload["mill_owner_id"]).first()
            if not mo:
                raise HTTPException(status_code=404, detail="Mill Owner not found")
            tx.mill_owner_id = mo.id
            tx.mill_owner_name = mo.name
        elif "mill_owner_name" in payload and payload["mill_owner_name"]:
            tx.mill_owner_name = payload["mill_owner_name"]

        if "rent" in payload:            tx.rent = payload["rent"]
        if "hidden_charges" in payload:  tx.hidden_charges = payload["hidden_charges"]
        if "commission_partner" in payload and payload["commission_partner"]:
            tx.commission_partner = payload["commission_partner"]

        # Per-item buying prices: { item_id: price } — sets item-level buying_price
        if "item_buying_prices" in payload and isinstance(payload["item_buying_prices"], dict):
            for item_id_str, buying_price in payload["item_buying_prices"].items():
                try:
                    item_id = int(item_id_str)
                    ti = db.query(TransactionItem).filter(
                        TransactionItem.id == item_id,
                        TransactionItem.transaction_id == tx.id
                    ).first()
                    if ti and buying_price is not None:
                        ti.buying_price = float(buying_price)
                except (ValueError, TypeError):
                    pass

        # Per-weight buying prices: { item_id: { weight_kg: price } }
        if "item_weight_prices" in payload and isinstance(payload["item_weight_prices"], dict):
            for item_id_str, wkg_map in payload["item_weight_prices"].items():
                if not isinstance(wkg_map, dict):
                    continue
                try:
                    item_id = int(item_id_str)
                    for wkg_str, bp in wkg_map.items():
                        wkg = float(wkg_str)
                        tiw = db.query(TransactionItemWeight).filter(
                            TransactionItemWeight.item_id == item_id,
                            TransactionItemWeight.weight_kg == wkg,
                        ).first()
                        if tiw and bp is not None:
                            tiw.buying_price = float(bp)
                except (ValueError, TypeError):
                    pass

        # Set global tx.price = weighted-average buying price across all weight rows
        db.flush()
        all_weights = db.query(TransactionItemWeight).join(TransactionItem).filter(
            TransactionItem.transaction_id == tx.id
        ).all()
        priced = [(w.buying_price, w.quantity) for w in all_weights if w.buying_price is not None]
        if priced:
            total_val = sum(p * q for p, q in priced)
            total_qty = sum(q for _, q in priced)
            tx.price = round(total_val / total_qty, 4) if total_qty else None

    else:  # outbound
        if "location" in payload:        tx.location = payload["location"]
        # FIX B3: commission_partner ("To Whom") was never written for outbound
        # transactions. The frontend sends data.commission_partner but the backend
        # ignored it, so the field disappeared after every save.
        if "commission_partner" in payload and payload["commission_partner"]:
            tx.commission_partner = payload["commission_partner"]

        # Per-item margin prices: { item_id: price }
        if "item_margin_prices" in payload and isinstance(payload["item_margin_prices"], dict):
            for item_id_str, margin_price in payload["item_margin_prices"].items():
                try:
                    item_id = int(item_id_str)
                    ti = db.query(TransactionItem).filter(
                        TransactionItem.id == item_id,
                        TransactionItem.transaction_id == tx.id
                    ).first()
                    if ti and margin_price is not None:
                        ti.margin_price = float(margin_price)
                except (ValueError, TypeError):
                    pass

        # Per-item selling prices: { item_id: price }
        if "item_selling_prices" in payload and isinstance(payload["item_selling_prices"], dict):
            for item_id_str, selling_price in payload["item_selling_prices"].items():
                try:
                    item_id = int(item_id_str)
                    ti = db.query(TransactionItem).filter(
                        TransactionItem.id == item_id,
                        TransactionItem.transaction_id == tx.id
                    ).first()
                    if ti and selling_price is not None:
                        ti.selling_price = float(selling_price)
                except (ValueError, TypeError):
                    pass

        # Per-weight selling prices: { item_id: { weight_kg: price } }
        if "item_weight_sell_prices" in payload and isinstance(payload["item_weight_sell_prices"], dict):
            for item_id_str, wkg_map in payload["item_weight_sell_prices"].items():
                if not isinstance(wkg_map, dict):
                    continue
                try:
                    item_id = int(item_id_str)
                    for wkg_str, sp in wkg_map.items():
                        wkg = float(wkg_str)
                        tiw = db.query(TransactionItemWeight).filter(
                            TransactionItemWeight.item_id == item_id,
                            TransactionItemWeight.weight_kg == wkg,
                        ).first()
                        if tiw and sp is not None:
                            # FIX B2: hasattr on a SQLAlchemy column always returns True, so
                            # the conditional was harmless but misleading. More importantly,
                            # the `else None` branch silently discarded valid prices if the
                            # guard ever evaluated False. Assign directly.
                            tiw.selling_price = float(sp)
                except (ValueError, TypeError):
                    pass

        # Set global sell_price = weighted avg of all item selling prices
        all_items = db.query(TransactionItem).filter(
            TransactionItem.transaction_id == tx.id
        ).all()
        priced_sell = [(it.selling_price, it.total_bags) for it in all_items if it.selling_price is not None]
        if priced_sell:
            total_val = sum(p * q for p, q in priced_sell)
            total_qty = sum(q for _, q in priced_sell)
            tx.sell_price = round(total_val / total_qty, 4) if total_qty else None

        # Compute transaction-level margin_price as weighted average of item margin/buying prices
        all_items_fresh = db.query(TransactionItem).filter(
            TransactionItem.transaction_id == tx.id
        ).all()
        if all_items_fresh and tx.total_bags:
            margin_items = [(it.margin_price or it.buying_price or tx.price or 0, it.total_bags or 0) for it in all_items_fresh]
            total_margin_val = sum(p * q for p, q in margin_items)
            total_qty_m = sum(q for _, q in margin_items)
            tx.margin_price = round(total_margin_val / total_qty_m, 4) if total_qty_m else None

        # Compute P&L using margin_price fallback chain: item.margin_price → tx.margin_price → item.buying_price → tx.price
        total_effective_cost = 0.0
        total_sell = 0.0
        has_both = False
        for it in all_items_fresh:
            effective_cost = it.margin_price or tx.margin_price or it.buying_price or tx.price or None
            sp = it.selling_price
            qty = it.total_bags or 0
            if effective_cost is not None and sp is not None and qty > 0:
                total_effective_cost += effective_cost * qty
                total_sell += sp * qty
                has_both = True
        if has_both and tx.total_bags:
            tx.profit_loss = round((total_sell - total_effective_cost) / tx.total_bags, 4)
        elif tx.sell_price is not None and tx.price is not None:
            tx.profit_loss = _compute_profit_loss(tx.margin_price or tx.price, tx.sell_price, tx.total_bags or 0)

    # Mark pending based on whether all weight rows have prices
    # A weight row is considered priced if:
    #   - its own buying_price is set, OR
    #   - its parent TransactionItem has a buying_price (set at arrival by admin)
    if tx.transaction_type == TransactionType.inbound:
        all_w = (
            db.query(TransactionItemWeight)
            .join(TransactionItem, TransactionItem.id == TransactionItemWeight.item_id)
            .filter(TransactionItem.transaction_id == tx.id)
            .all()
        )
        # Also load items to check item-level buying_price
        all_items_map = {
            it.id: it for it in db.query(TransactionItem).filter(
                TransactionItem.transaction_id == tx.id
            ).all()
        }
        def _weight_is_priced(w):
            if w.buying_price is not None:
                return True
            parent = all_items_map.get(w.item_id)
            return parent is not None and parent.buying_price is not None

        all_priced = all(_weight_is_priced(w) for w in all_w) if all_w else False
        # Also require mill_owner_name, rent, hidden_charges to be filled before marking complete
        all_admin_fields_filled = (
            bool(tx.mill_owner_name and tx.mill_owner_name.strip()) and
            tx.rent is not None and
            tx.hidden_charges is not None
        )
        tx.admin_pending = not (all_priced and all_admin_fields_filled)
        tx.approval_status = ApprovalStatus.pending if tx.admin_pending else ApprovalStatus.completed
    else:
        # FIX B5: Previously only checked it.selling_price (item-level), but per-weight
        # selling prices are stored on TransactionItemWeight.selling_price. A transaction
        # where only weight-level prices were filled would stay permanently pending.
        # Now: a TransactionItem is considered sell-priced if it has an item-level price
        # OR all of its weight rows have a selling_price set.
        all_items_check = db.query(TransactionItem).filter(
            TransactionItem.transaction_id == tx.id
        ).all()

        def _item_is_sell_priced(it: TransactionItem) -> bool:
            if it.selling_price is not None:
                return True
            weights = db.query(TransactionItemWeight).filter(
                TransactionItemWeight.item_id == it.id
            ).all()
            if weights:
                return all(w.selling_price is not None for w in weights)
            return False

        all_sell_priced = all(_item_is_sell_priced(it) for it in all_items_check) if all_items_check else False
        tx.admin_pending = not all_sell_priced
        tx.approval_status = ApprovalStatus.pending if tx.admin_pending else ApprovalStatus.completed

    if not tx.admin_pending:
        tx.completed_by = current_user.id
        tx.completed_at = datetime.utcnow()

    db.commit()
    return _load_full_transaction(db, tx.id)


# ============================================================
# PROFIT / LOSS
# ============================================================
@router.get("/{transaction_id}/profit-loss", response_model=ProfitLossOut)
def get_profit_loss(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)
    tx = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.transaction_type != TransactionType.outbound:
        raise HTTPException(status_code=400, detail="Profit/Loss only applies to outbound transactions")

    diff_per_bag = None
    total_diff = None
    effective_cost = tx.margin_price or tx.price
    if effective_cost is not None and tx.sell_price is not None:
        diff_per_bag = round(float(tx.sell_price) - float(effective_cost), 2)
        total_diff = round(diff_per_bag * (tx.total_bags or 0), 2)

    return ProfitLossOut(
        transaction_id=tx.id,
        buy_price=tx.price,
        margin_price=tx.margin_price,
        sell_price=tx.sell_price,
        diff_per_bag=diff_per_bag,
        total_bags=tx.total_bags or 0,
        total_profit_loss=total_diff,
        status=("profit" if (total_diff or 0) > 0 else "loss" if (total_diff or 0) < 0 else "break_even"),
    )


# ============================================================
# LEGACY SINGLE-ITEM CREATE (backwards compat)
# ============================================================
@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction_legacy(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stock = db.query(Stock).filter(Stock.id == payload.stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    if not stock.brand_id:
        raise HTTPException(
            status_code=400,
            detail="Legacy stock has no brand_id; please migrate or use /arrival /send"
        )

    if payload.transaction_type == TransactionType.inbound:
        arrival = ArrivalCreate(
            vehicle_no=payload.vehicle_number or "",
            driver_name=getattr(payload, "driver_name", "") or "—",
            driver_number=getattr(payload, "mobile_number", "") or "—",
            source=payload.source,
            commission_partner=getattr(payload, "sub_destination", None) or getattr(payload, "sub_source", None),
            transaction_date=payload.transaction_date,
            notes=payload.notes,
            items=[{
                "brand_id": stock.brand_id,
                "rice_type_id": stock.rice_type_id,
                "bag_size": stock.bag_weight_kg or 25,
                "weights": [{"weight": stock.bag_weight_kg or 25, "quantity": payload.quantity_bags}],
                "warehouse_splits": [{"warehouse_id": payload.warehouse_id, "bags": payload.quantity_bags}],
            }],
        )
        return create_arrival(arrival, db, current_user)

    else:
        send = SendCreate(
            vehicle_no=payload.vehicle_number or "",
            driver_name=getattr(payload, "driver_name", "") or "—",
            driver_number=getattr(payload, "mobile_number", "") or "—",
            destination=payload.destination,
            commission_partner=getattr(payload, "sub_destination", None),
            transaction_date=payload.transaction_date,
            notes=payload.notes,
            items=[{
                "brand_id": stock.brand_id,
                "warehouse_id": payload.warehouse_id,
                "bag_weight_kg": stock.bag_weight_kg or 25,
                "bags": payload.quantity_bags,
            }],
        )
        return create_send(send, db, current_user)


# ============================================================
# DELETE (admin only) — also reverses stock impact
# ============================================================
@router.delete("/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_admin(current_user)

    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.items).joinedload(TransactionItem.splits))
        .filter(Transaction.id == transaction_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    for item in tx.items:
        bag_size = float(item.bag_size_kg or 25.0)
        if tx.transaction_type == TransactionType.inbound:
            for sp in item.splits:
                stock = (
                    db.query(Stock)
                    .filter(
                        Stock.brand_id == item.brand_id,
                        Stock.warehouse_id == sp.warehouse_id,
                        Stock.bag_weight_kg == bag_size,
                    )
                    .first()
                )
                if stock:
                    stock.total_bags = max(0, (stock.total_bags or 0) - (sp.bags or 0))
                    stock.total_weight_kg = max(0.0, (stock.total_weight_kg or 0.0) - (sp.weight_kg or 0))
        else:
            stock = (
                db.query(Stock)
                .filter(
                    Stock.brand_id == item.brand_id,
                    Stock.warehouse_id == item.warehouse_id,
                    Stock.bag_weight_kg == bag_size,
                )
                .first()
            )
            if stock:
                stock.total_bags = (stock.total_bags or 0) + (item.total_bags or 0)
                stock.total_weight_kg = (stock.total_weight_kg or 0.0) + (item.total_weight_kg or 0)
                # Restore weight breakdown using bag_size (unit weight), not total weight_kg
                bd = (
                    db.query(StockWeightBreakdown)
                    .filter(
                        StockWeightBreakdown.stock_id == stock.id,
                        StockWeightBreakdown.weight_kg == bag_size,
                    )
                    .first()
                )
                if bd:
                    bd.quantity = (bd.quantity or 0) + (item.total_bags or 0)
                else:
                    db.add(StockWeightBreakdown(
                        stock_id=stock.id,
                        weight_kg=bag_size,
                        quantity=item.total_bags or 0,
                    ))

    db.delete(tx)
    db.commit()
    return {"message": "Transaction deleted and stock reversed"}