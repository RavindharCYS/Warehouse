from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey,
    Enum, Boolean, Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


# ============================================================
# ENUMS
# ============================================================
class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class TransactionType(str, enum.Enum):
    inbound = "inbound"    # Arrival / Unloading
    outbound = "outbound"  # Dispatch / Sending


class QualityGrade(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    premium = "premium"
    standard = "standard"
    other = "other"


class ApprovalStatus(str, enum.Enum):
    """For admin-pending workflow on transactions."""
    pending = "pending"      # waiting on admin to fill mill_owner / price / sell_price etc.
    completed = "completed"  # admin has filled all required fields
    not_required = "not_required"  # created directly by admin -> no pending step


# ============================================================
# USERS
# ============================================================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    full_name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    email = Column(String(255), nullable=True, unique=True)
    phone_1 = Column(String(15), nullable=True)
    phone_2 = Column(String(15), nullable=True)
    is_active = Column(Boolean, default=True)
    otp_secret = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    transactions_created = relationship(
        "Transaction",
        back_populates="created_by_user",
        foreign_keys="Transaction.created_by",
    )
    transactions_completed = relationship(
        "Transaction",
        back_populates="completed_by_user",
        foreign_keys="Transaction.completed_by",
    )


# ============================================================
# WAREHOUSE
# ============================================================
class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String(100), unique=True, nullable=False)
    location_name_ta = Column(String(200), nullable=True)
    address = Column(Text, nullable=True)
    capacity = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transaction_items = relationship("TransactionItem", back_populates="warehouse")


# ============================================================
# BRAND  (NEW master table — brands now created from Arrival page)
# ============================================================
class Brand(Base):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    name_ta = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    rice_types = relationship("RiceType", back_populates="brand", cascade="all, delete-orphan")
    stocks = relationship("Stock", back_populates="brand")


# ============================================================
# RICE TYPE  (NEW master table — also creatable from Arrival)
# ============================================================
class RiceType(Base):
    __tablename__ = "rice_types"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=True)  # nullable -> can be global
    name = Column(String(100), nullable=False)
    name_ta = Column(String(200), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    brand = relationship("Brand", back_populates="rice_types")
    stocks = relationship("Stock", back_populates="rice_type_ref")

    __table_args__ = (
        UniqueConstraint("brand_id", "name", name="uq_ricetype_brand_name"),
    )


# ============================================================
# MILL OWNER  (NEW — admin-only master)
# ============================================================
class MillOwner(Base):
    __tablename__ = "mill_owners"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False, index=True)
    contact_number = Column(String(20), nullable=True)
    address = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)


# ============================================================
# STOCK  (current on-hand inventory per Brand × RiceType × Warehouse × BagWeight)
# Refactored to support multiple weights (5KG / 10KG / 25KG / 26KG ...) per brand
# ============================================================
class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)

    # Foreign keys to masters (replaces free-text brand_name / rice_type)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False)
    rice_type_id = Column(Integer, ForeignKey("rice_types.id"), nullable=True)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)

    # Kept for backward compatibility / display
    brand_name = Column(String(100), nullable=True)
    brand_name_ta = Column(String(200), nullable=True)
    rice_type = Column(String(100), nullable=True)
    rice_type_ta = Column(String(200), nullable=True)
    production_company = Column(String(100), nullable=True)
    production_company_ta = Column(String(200), nullable=True)

    # Inventory accounting
    # A "bag" = 25KG or 26KG total (configurable per stock row).
    bag_weight_kg = Column(Float, default=25.0)        # 25 or 26
    # Total bag count currently in this row
    total_bags = Column(Integer, default=0)
    # Total kg currently in this row (sum of all weight breakdowns)
    total_weight_kg = Column(Float, default=0.0)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    brand = relationship("Brand", back_populates="stocks")
    rice_type_ref = relationship("RiceType", back_populates="stocks")
    warehouse = relationship("Warehouse")
    weight_breakdowns = relationship(
        "StockWeightBreakdown",
        back_populates="stock",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "brand_id", "rice_type_id", "warehouse_id", "bag_weight_kg",
            name="uq_stock_brand_rice_wh_bag",
        ),
        Index("ix_stock_brand_wh", "brand_id", "warehouse_id"),
    )


# ============================================================
# STOCK WEIGHT BREAKDOWN
# Tracks how a Stock row is composed by individual weight units.
# e.g. for a 25KG bag stock row: 10KG×2 + 5KG×1 per bag, etc.
# This allows the WarehousePage info popup to show:
#   "10KG in X, 5KG in Y, ..." breakdowns.
# ============================================================
class StockWeightBreakdown(Base):
    __tablename__ = "stock_weight_breakdowns"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    weight_kg = Column(Float, nullable=False)        # 5, 10, 25, 26 ...
    quantity = Column(Integer, nullable=False, default=0)  # number of pieces of this weight on hand

    stock = relationship("Stock", back_populates="weight_breakdowns")

    __table_args__ = (
        UniqueConstraint("stock_id", "weight_kg", name="uq_breakdown_stock_weight"),
    )


# ============================================================
# TRANSACTION  (header — one per vehicle arrival/dispatch)
# A single vehicle = ONE Transaction with MANY TransactionItems.
# Each TransactionItem can have multiple weights and a warehouse split.
# ============================================================
class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_type = Column(Enum(TransactionType), nullable=False)
    transaction_date = Column(DateTime(timezone=True), nullable=False, index=True)

    # Vehicle / driver info (applies to whole load)
    vehicle_number = Column(String(20), nullable=True, index=True)
    driver_name = Column(String(100), nullable=True)
    driver_number = Column(String(20), nullable=True)  # renamed from mobile_number

    # Source (for inbound) / Destination (for outbound)
    source = Column(String(200), nullable=True)
    destination = Column(String(200), nullable=True)
    commission_partner = Column(String(200), nullable=True)  # renamed from sub_destination

    # Aggregate counts across all items (denormalized for quick listing)
    total_bags = Column(Integer, default=0)
    total_weight_kg = Column(Float, default=0.0)

    # Multi-load grouping (kept for legacy, normally same as id)
    load_group_id = Column(String(50), nullable=True, index=True)

    notes = Column(Text, nullable=True)
    quality_grade = Column(Enum(QualityGrade), default=QualityGrade.standard)
    quality_note = Column(String(100), nullable=True)

    # ----- Admin-only fields (INBOUND) -----
    mill_owner_id = Column(Integer, ForeignKey("mill_owners.id"), nullable=True)
    mill_owner_name = Column(String(150), nullable=True)   # snapshot
    price = Column(Float, nullable=True)                   # buying price (per bag or total — see app convention)
    rent = Column(Float, nullable=True)
    hidden_charges = Column(Float, nullable=True)

    # ----- Admin-only fields (OUTBOUND) -----
    location = Column(String(200), nullable=True)          # was sub_destination
    sell_price = Column(Float, nullable=True)
    # Server-computed for green/red/black UI badge:
    #   sell_price - price  (positive=green, negative=red, zero=black)
    profit_loss = Column(Float, nullable=True)

    # ----- Approval workflow -----
    approval_status = Column(
        Enum(ApprovalStatus),
        default=ApprovalStatus.pending,
        nullable=False,
        index=True,
    )
    admin_pending = Column(Boolean, default=False, index=True)  # legacy quick-flag

    # ----- Audit -----
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    items = relationship(
        "TransactionItem",
        back_populates="transaction",
        cascade="all, delete-orphan",
    )
    mill_owner = relationship("MillOwner")
    created_by_user = relationship(
        "User",
        back_populates="transactions_created",
        foreign_keys=[created_by],
    )
    completed_by_user = relationship(
        "User",
        back_populates="transactions_completed",
        foreign_keys=[completed_by],
    )

    __table_args__ = (
        Index("ix_txn_date_type", "transaction_date", "transaction_type"),
    )


# ============================================================
# TRANSACTION ITEM
# One vehicle can carry many (brand × rice_type × bag_size) loads.
# Each item's bags can also be SPLIT across multiple warehouses
# via TransactionItemSplit.
# ============================================================
class TransactionItem(Base):
    __tablename__ = "transaction_items"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=False)

    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False)
    rice_type_id = Column(Integer, ForeignKey("rice_types.id"), nullable=True)

    # Bag math
    bag_size_kg = Column(Float, default=25.0)         # 25 or 26
    total_bags = Column(Integer, default=0)
    total_weight_kg = Column(Float, default=0.0)

    # For OUTBOUND (send) — direct warehouse ref because the user picks the source warehouse
    # For INBOUND  — leave NULL (use TransactionItemSplit instead)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)

    # Per-item pricing (admin-only)
    # For INBOUND: buying price per bag for this specific item
    # For OUTBOUND: selling price per bag for this specific item
    buying_price = Column(Float, nullable=True)
    selling_price = Column(Float, nullable=True)

    notes = Column(Text, nullable=True)

    transaction = relationship("Transaction", back_populates="items")
    brand = relationship("Brand")
    rice_type_ref = relationship("RiceType")
    warehouse = relationship("Warehouse", back_populates="transaction_items")

    weights = relationship(
        "TransactionItemWeight",
        back_populates="item",
        cascade="all, delete-orphan",
    )
    splits = relationship(
        "TransactionItemSplit",
        back_populates="item",
        cascade="all, delete-orphan",
    )


# ============================================================
# TRANSACTION ITEM WEIGHT
# Each item can have multiple weight rows e.g.
#   { weight_kg: 26, quantity: 10 }
#   { weight_kg: 5,  quantity: 5  }
# Total weight = sum(weight_kg * quantity).
# ============================================================
class TransactionItemWeight(Base):
    __tablename__ = "transaction_item_weights"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("transaction_items.id"), nullable=False)
    weight_kg = Column(Float, nullable=False)        # individual unit weight (5, 10, 25, 26 ...)
    quantity = Column(Integer, nullable=False)       # count of that weight unit

    item = relationship("TransactionItem", back_populates="weights")


# ============================================================
# TRANSACTION ITEM SPLIT  (Warehouse split for INBOUND)
# 300 bags can be split:  100→WH1, 50→WH2, 150→WH3
# Sum(splits.bags) MUST equal item.total_bags  (validated in service layer).
# ============================================================
class TransactionItemSplit(Base):
    __tablename__ = "transaction_item_splits"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("transaction_items.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    bags = Column(Integer, nullable=False, default=0)
    weight_kg = Column(Float, nullable=False, default=0.0)

    item = relationship("TransactionItem", back_populates="splits")
    warehouse = relationship("Warehouse")


# ============================================================
# OTP LOG
# ============================================================
class OTPLog(Base):
    __tablename__ = "otp_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    otp_code = Column(String(6), nullable=False)
    email_used = Column(String(255), nullable=False)
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ============================================================
# CUSTOM QUALITY GRADE
# ============================================================
class CustomQualityGrade(Base):
    __tablename__ = "custom_quality_grades"

    id = Column(Integer, primary_key=True, index=True)
    grade_name = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())