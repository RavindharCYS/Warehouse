# backend/schemas.py
from pydantic import BaseModel, field_validator, model_validator, EmailStr, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime
from models import UserRole, TransactionType, QualityGrade, ApprovalStatus


# ============================================================
# AUTH
# ============================================================
class LoginRequest(BaseModel):
    username: str
    password: str


class OTPVerifyRequest(BaseModel):
    username: str
    otp_code: str
    session_token: str


class OTPSendResponse(BaseModel):
    session_token: str
    message: str
    email_masked: str


# ============================================================
# USER
# ============================================================
class UserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    role: UserRole = UserRole.user
    email: Optional[str] = None
    phone_1: Optional[str] = None
    phone_2: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    email: Optional[str] = None
    phone_1: Optional[str] = None
    phone_2: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: UserRole
    email: Optional[str] = None
    phone_1: Optional[str] = None
    phone_2: Optional[str] = None
    is_active: bool
    created_at: datetime


# ============================================================
# WAREHOUSE
# ============================================================
class WarehouseCreate(BaseModel):
    location_name: str
    location_name_ta: Optional[str] = None
    address: Optional[str] = None
    capacity: float = 0.0


class WarehouseUpdate(BaseModel):
    location_name: Optional[str] = None
    location_name_ta: Optional[str] = None
    address: Optional[str] = None
    capacity: Optional[float] = None
    is_active: Optional[bool] = None


class WarehouseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    location_name: str
    location_name_ta: Optional[str] = None
    address: Optional[str] = None
    capacity: float
    is_active: bool
    created_at: datetime


class WarehouseWithStock(WarehouseOut):
    total_stock_kg: float = 0.0
    total_bags: int = 0
    stock_percentage: float = 0.0


# Per-brand info popup payload (used by /warehouses/{id}/brands/{brand_id})
class BrandWeightBreakdownEntry(BaseModel):
    weight_kg: float
    quantity: int
    bags: Optional[int] = None
    label: Optional[str] = None


class BrandRecentArrival(BaseModel):
    id: int
    transaction_date: datetime
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_number: Optional[str] = None
    source: Optional[str] = None
    commission_partner: Optional[str] = None
    mill_owner_name: Optional[str] = None
    bags: int = 0
    total_bags: Optional[int] = None


class BrandRiceTypeSummary(BaseModel):
    name: str
    bags: int = 0


class WarehouseBrandInfo(BaseModel):
    total_bags: int = 0
    total_weight_kg: float = 0.0
    weight_breakdown: List[BrandWeightBreakdownEntry] = []
    recent_arrivals: List[BrandRecentArrival] = []
    rice_types: List[BrandRiceTypeSummary] = []


class WarehouseWeightBreakdown(BaseModel):
    summary: List[BrandWeightBreakdownEntry] = []
    items: List[Dict[str, Any]] = []  # [{stock_id, weight_kg, quantity}]


class WarehouseAvailableBags(BaseModel):
    items: List[Dict[str, Any]] = []  # [{brand_id, bag_weight_kg, total_bags}]


# ============================================================
# BRAND
# ============================================================
class BrandCreate(BaseModel):
    name: str
    name_ta: Optional[str] = None


class BrandUpdate(BaseModel):
    name: Optional[str] = None
    name_ta: Optional[str] = None
    is_active: Optional[bool] = None


class BrandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_ta: Optional[str] = None
    is_active: bool
    created_at: datetime


# ============================================================
# RICE TYPE
# ============================================================
class RiceTypeCreate(BaseModel):
    name: str
    name_ta: Optional[str] = None
    brand_id: Optional[int] = None


class RiceTypeUpdate(BaseModel):
    name: Optional[str] = None
    name_ta: Optional[str] = None
    brand_id: Optional[int] = None
    is_active: Optional[bool] = None


class RiceTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    name_ta: Optional[str] = None
    brand_id: Optional[int] = None
    is_active: bool
    created_at: datetime


# ============================================================
# MILL OWNER (admin only)
# ============================================================
class MillOwnerCreate(BaseModel):
    name: str
    contact_number: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class MillOwnerUpdate(BaseModel):
    name: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class MillOwnerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contact_number: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime


# ============================================================
# STOCK  (refactored — keeps legacy fields for back-compat)
# ============================================================
class StockCreate(BaseModel):
    """
    Legacy stock create: supports both old free-text fields
    and new FK fields. At least brand_name OR brand_id is required.
    """
    # New FK fields
    brand_id: Optional[int] = None
    rice_type_id: Optional[int] = None
    warehouse_id: Optional[int] = None

    # Legacy / display fields
    brand_name: Optional[str] = None
    brand_name_ta: Optional[str] = None
    rice_type: Optional[str] = None
    rice_type_ta: Optional[str] = None
    production_company: Optional[str] = None
    production_company_ta: Optional[str] = None
    bag_weight_kg: float = 25.0

    @model_validator(mode="after")
    def _need_brand_ref(self):
        if not self.brand_id and not self.brand_name:
            raise ValueError("Either brand_id or brand_name is required")
        return self


class StockUpdate(BaseModel):
    brand_id: Optional[int] = None
    rice_type_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    brand_name: Optional[str] = None
    brand_name_ta: Optional[str] = None
    rice_type: Optional[str] = None
    rice_type_ta: Optional[str] = None
    production_company: Optional[str] = None
    production_company_ta: Optional[str] = None
    bag_weight_kg: Optional[float] = None
    is_active: Optional[bool] = None


class StockWeightBreakdownOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weight_kg: float
    quantity: int


class StockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    brand_id: Optional[int] = None
    rice_type_id: Optional[int] = None
    warehouse_id: Optional[int] = None

    brand_name: Optional[str] = None
    brand_name_ta: Optional[str] = None
    rice_type: Optional[str] = None
    rice_type_ta: Optional[str] = None
    production_company: Optional[str] = None
    production_company_ta: Optional[str] = None

    bag_weight_kg: float
    total_bags: int = 0
    total_weight_kg: float = 0.0
    is_active: bool
    created_at: datetime

    # Optional nested
    brand: Optional[BrandOut] = None
    rice_type_ref: Optional[RiceTypeOut] = None
    warehouse: Optional[WarehouseOut] = None
    weight_breakdowns: List[StockWeightBreakdownOut] = []


class StockWithInventory(StockOut):
    """Adds aggregated movement counters."""
    remaining_bags: int = 0
    remaining_kg: float = 0.0
    total_inbound_bags: int = 0
    total_outbound_bags: int = 0
    last_buy_price: Optional[float] = None  # for Send page profit/loss preview


# Stock history entry (for /stocks/{id}/history)
class StockHistoryEntry(BaseModel):
    id: int
    transaction_type: TransactionType
    transaction_date: datetime
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_number: Optional[str] = None
    source: Optional[str] = None
    destination: Optional[str] = None
    commission_partner: Optional[str] = None
    total_bags: int = 0
    total_weight_kg: float = 0.0
    quantity_bags: Optional[int] = None  # alias
    quantity_kg: Optional[float] = None
    admin_pending: bool = False
    # Admin-only (controller should strip for non-admin)
    mill_owner_name: Optional[str] = None
    price: Optional[float] = None
    sell_price: Optional[float] = None


# Calendar response shape
class CalendarDayEntry(BaseModel):
    inbound: int = 0
    outbound: int = 0
    transactions: List[StockHistoryEntry] = []


# ============================================================
# TRANSACTION  —  multi-item shapes
# ============================================================
class WeightRow(BaseModel):
    """One weight row inside an arrival item."""
    weight: float
    quantity: int
    buying_price: Optional[float] = None  # per-weight buying price (admin only)

    @field_validator("weight")
    @classmethod
    def _weight_positive(cls, v):
        if v <= 0:
            raise ValueError("weight must be > 0")
        return v

    @field_validator("quantity")
    @classmethod
    def _qty_positive(cls, v):
        if v <= 0:
            raise ValueError("quantity must be > 0")
        return v


class ArrivalItemEntry(BaseModel):
    """
    Per-row entry with an explicit warehouse_id.
    This is the preferred (new) format sent by the frontend.
    Each row carries its own warehouse assignment so the backend
    can apply exact stock quantities without any proportional math.
    """
    weight: float
    quantity: int
    warehouse_id: int
    buying_price: Optional[float] = None   # admin only
    margin_price: Optional[float] = None   # admin only — internal cost basis for P&L

    @field_validator("weight")
    @classmethod
    def _weight_positive(cls, v):
        if v <= 0:
            raise ValueError("weight must be > 0")
        return v

    @field_validator("quantity")
    @classmethod
    def _qty_positive(cls, v):
        if v <= 0:
            raise ValueError("quantity must be > 0")
        return v


class WarehouseSplit(BaseModel):
    """One warehouse allocation inside an arrival item."""
    warehouse_id: int
    bags: int

    @field_validator("bags")
    @classmethod
    def _bags_positive(cls, v):
        if v <= 0:
            raise ValueError("bags must be > 0")
        return v


# ── ARRIVAL (inbound) ─────────────────────────────────────────
class ArrivalItemCreate(BaseModel):
    brand_id: int
    rice_type_id: Optional[int] = None
    bag_size: float = 25.0   # 25 or 26

    # NEW: per-row entries with explicit warehouse_id (preferred path).
    # When present, the backend uses these directly — no proportional math,
    # no rounding drift, bags and pieces stay in their correct warehouses.
    entries: Optional[List[ArrivalItemEntry]] = None

    # LEGACY: flat weight rows + separate warehouse splits.
    # Still accepted for backward compatibility when entries is absent.
    weights: Optional[List[WeightRow]] = None
    warehouse_splits: Optional[List[WarehouseSplit]] = None

    # Per-item admin-only pricing
    buying_price: Optional[float] = None  # buying price per bag for this item
    margin_price: Optional[float] = None  # admin only — internal cost basis for P&L

    # Optional client-computed totals (server recomputes & validates)
    total_bags: Optional[int] = None
    total_weight_kg: Optional[float] = None

    @field_validator("bag_size")
    @classmethod
    def _bag_size_valid(cls, v):
        if v not in (25.0, 26.0):
            raise ValueError("bag_size must be 25 or 26")
        return v

    @model_validator(mode="after")
    def _require_weights_or_entries(self):
        has_entries = bool(self.entries)
        has_legacy = bool(self.weights) and bool(self.warehouse_splits)
        if not has_entries and not has_legacy:
            raise ValueError(
                "Provide either 'entries' (new format) or both 'weights' and "
                "'warehouse_splits' (legacy format)"
            )
        return self


class ArrivalCreate(BaseModel):
    """Multi-item arrival payload — one vehicle, many loads."""
    type: Optional[str] = "arrival"  # informational
    vehicle_no: str
    driver_name: str
    driver_number: str
    source: Optional[str] = None
    commission_partner: Optional[str] = None
    transaction_date: Optional[datetime] = None
    notes: Optional[str] = None
    quality_grade: Optional[QualityGrade] = QualityGrade.standard
    quality_note: Optional[str] = None

    items: List[ArrivalItemCreate]

    # Admin-only (silently dropped for non-admin in router)
    # rent & hidden_charges are GLOBAL for the whole transaction
    # price (buying_price) is now per-item in ArrivalItemCreate
    mill_owner_id: Optional[int] = None
    mill_owner_name: Optional[str] = None
    rent: Optional[float] = None
    hidden_charges: Optional[float] = None
    # Legacy global price kept for backward compatibility (used if item-level buying_price not set)
    price: Optional[float] = None

    @field_validator("items")
    @classmethod
    def _items_not_empty(cls, v):
        if not v:
            raise ValueError("At least one item is required")
        return v


# ── SEND (outbound) ───────────────────────────────────────────
class SendItemCreate(BaseModel):
    brand_id: int
    rice_type_id: Optional[int] = None
    warehouse_id: int
    bag_weight_kg: float
    bags: int

    # Per-item selling price (mandatory for send)
    selling_price: Optional[float] = None
    # Admin-controlled margin price for profit/loss calculation
    # profit = selling_price - margin_price (falls back to buying_price)
    margin_price: Optional[float] = None

    @field_validator("bags")
    @classmethod
    def _bags_positive(cls, v):
        if v <= 0:
            raise ValueError("bags must be > 0")
        return v

    @field_validator("bag_weight_kg")
    @classmethod
    def _weight_positive(cls, v):
        if v <= 0:
            raise ValueError("bag_weight_kg must be > 0")
        return v


class SendCreate(BaseModel):
    type: Optional[str] = "send"
    vehicle_no: str
    driver_name: str
    driver_number: str
    destination: Optional[str] = None
    commission_partner: Optional[str] = None
    transaction_date: Optional[datetime] = None
    notes: Optional[str] = None
    quality_grade: Optional[QualityGrade] = QualityGrade.standard
    quality_note: Optional[str] = None

    items: List[SendItemCreate]

    # Admin-only
    location: Optional[str] = None
    sell_price: Optional[float] = None

    @field_validator("items")
    @classmethod
    def _items_not_empty(cls, v):
        if not v:
            raise ValueError("At least one item is required")
        return v


# ── Admin-only patches ────────────────────────────────────────
class AdminInboundFields(BaseModel):
    mill_owner_id: Optional[int] = None
    mill_owner_name: Optional[str] = None
    price: Optional[float] = None
    rent: Optional[float] = None
    hidden_charges: Optional[float] = None


class AdminOutboundFields(BaseModel):
    location: Optional[str] = None
    sell_price: Optional[float] = None


# ── Transaction OUT (rich, with nested items) ─────────────────
class TransactionItemWeightOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weight_kg: float
    quantity: int
    buying_price: Optional[float] = None
    selling_price: Optional[float] = None


class TransactionItemSplitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    warehouse_id: int
    bags: int
    weight_kg: float
    warehouse: Optional[WarehouseOut] = None


class TransactionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    brand_id: int
    rice_type_id: Optional[int] = None
    bag_size_kg: float
    total_bags: int
    total_weight_kg: float
    warehouse_id: Optional[int] = None
    notes: Optional[str] = None

    # Per-item pricing
    buying_price: Optional[float] = None
    selling_price: Optional[float] = None
    margin_price: Optional[float] = None

    brand: Optional[BrandOut] = None
    rice_type_ref: Optional[RiceTypeOut] = None
    warehouse: Optional[WarehouseOut] = None
    weights: List[TransactionItemWeightOut] = []
    splits: List[TransactionItemSplitOut] = []


class TransactionOut(BaseModel):
    """
    Rich transaction output. Keeps legacy fields populated where possible
    so older clients keep working.
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_type: TransactionType
    transaction_date: datetime

    # Vehicle / driver
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_number: Optional[str] = None

    # Parties
    source: Optional[str] = None
    destination: Optional[str] = None
    commission_partner: Optional[str] = None

    # Aggregates
    total_bags: int = 0
    total_weight_kg: float = 0.0

    # Notes / quality
    notes: Optional[str] = None
    quality_grade: Optional[QualityGrade] = None
    quality_note: Optional[str] = None
    load_group_id: Optional[str] = None

    # Admin-only fields (router should null these out for non-admin requests)
    mill_owner_id: Optional[int] = None
    mill_owner_name: Optional[str] = None
    price: Optional[float] = None
    rent: Optional[float] = None
    hidden_charges: Optional[float] = None
    location: Optional[str] = None
    sell_price: Optional[float] = None
    margin_price: Optional[float] = None
    profit_loss: Optional[float] = None

    # Workflow
    approval_status: Optional[ApprovalStatus] = None
    admin_pending: bool = False
    completed_at: Optional[datetime] = None

    # Audit
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Nested
    items: List[TransactionItemOut] = []
    mill_owner: Optional[MillOwnerOut] = None
    created_by_user: Optional[UserOut] = None
    completed_by_user: Optional[UserOut] = None

    # ── Legacy aliases (filled by serializers if needed) ──
    # quantity_bags / quantity_kg map to total_bags / total_weight_kg
    # stock / warehouse / sub_destination / sub_source kept as None for new transactions
    quantity_bags: Optional[int] = None
    quantity_kg: Optional[float] = None
    sub_source: Optional[str] = None
    sub_destination: Optional[str] = None
    stock: Optional[StockOut] = None
    warehouse: Optional[WarehouseOut] = None

    @model_validator(mode="after")
    def _fill_legacy_aliases(self):
        # Map total_* into legacy quantity_* for old clients
        if self.quantity_bags is None:
            self.quantity_bags = self.total_bags
        if self.quantity_kg is None:
            self.quantity_kg = self.total_weight_kg
        # commission_partner shows as sub_destination in legacy clients
        if self.sub_destination is None:
            self.sub_destination = self.commission_partner
        return self


# ── Legacy single-item TransactionCreate (kept) ───────────────
class TransactionCreate(BaseModel):
    """
    Legacy create payload. Router converts this into an
    ArrivalCreate or SendCreate internally.
    """
    stock_id: int
    warehouse_id: int
    transaction_type: TransactionType
    quantity_bags: int
    quality_grade: QualityGrade = QualityGrade.standard
    source: Optional[str] = None
    sub_source: Optional[str] = None
    destination: Optional[str] = None
    sub_destination: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    mobile_number: Optional[str] = None  # legacy → driver_number
    notes: Optional[str] = None
    quality_note: Optional[str] = None
    transaction_date: datetime

    @field_validator("quantity_bags")
    @classmethod
    def bags_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be positive")
        return v


# ── Profit / Loss ─────────────────────────────────────────────
class ProfitLossOut(BaseModel):
    transaction_id: int
    buy_price: Optional[float] = None
    margin_price: Optional[float] = None
    sell_price: Optional[float] = None
    diff_per_bag: Optional[float] = None
    total_bags: int = 0
    total_profit_loss: Optional[float] = None
    status: str  # 'profit' | 'loss' | 'break_even'


# ============================================================
# AUTH TOKEN
# ============================================================
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ============================================================
# DASHBOARD
# ============================================================
class DashboardSummary(BaseModel):
    total_warehouses: int
    total_stock_types: int
    total_inbound_today: int
    total_outbound_today: int
    total_stock_kg: float
    total_bags: int
    low_stock_items: List[StockWithInventory]
    recent_transactions: List[TransactionOut]
    warehouse_summary: List[WarehouseWithStock]


class DashboardDailyCount(BaseModel):
    date: str       # 'yyyy-MM-dd'
    total_bags: int = 0
    total_weight_kg: float = 0.0
    transaction_count: int = 0


class DashboardTotalStock(BaseModel):
    total_bags: int = 0
    total_kg: float = 0.0
    total_warehouses: int = 0
    total_brands: int = 0


class PendingApprovalEntry(BaseModel):
    """Lightweight payload for the admin pending-approvals widget."""
    id: int
    transaction_type: TransactionType
    transaction_date: datetime
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_number: Optional[str] = None
    total_bags: int = 0
    total_weight_kg: float = 0.0
    source: Optional[str] = None
    destination: Optional[str] = None
    commission_partner: Optional[str] = None
    admin_pending: bool = True
    approval_status: Optional[ApprovalStatus] = None
    created_at: datetime
    created_by_user: Optional[UserOut] = None


# ============================================================
# STOCK LEDGER (legacy)
# ============================================================
class StockLedger(BaseModel):
    stock: StockOut
    warehouse: WarehouseOut
    transactions: List[TransactionOut]
    opening_stock: int
    total_inbound: int
    total_outbound: int
    closing_stock: int
    closing_stock_kg: float


# ============================================================
# CUSTOM QUALITY GRADES
# ============================================================
class CustomQualityGradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    grade_name: str


class CustomQualityGradeCreate(BaseModel):
    grade_name: str


# ============================================================
# REPORTS
# ============================================================
class ReportFilters(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    type: Optional[TransactionType] = None
    brand_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    mill_owner_name: Optional[str] = None
    vehicle_no: Optional[str] = None


class ReportResponse(BaseModel):
    transactions: List[TransactionOut]
    total_inbound_bags: int = 0
    total_outbound_bags: int = 0
    total_inbound_kg: float = 0.0
    total_outbound_kg: float = 0.0
    total_profit_loss: Optional[float] = None
    filters: Optional[ReportFilters] = None