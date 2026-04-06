from pydantic import BaseModel, field_validator, model_validator, EmailStr
from typing import Optional, List
from datetime import datetime
from models import UserRole, TransactionType, QualityGrade


# ── Auth Schemas ──────────────────────────────────────────────
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
    email_masked: str   # ← was phone_masked


# ── User Schemas ──────────────────────────────────────────────
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
    model_config = {"from_attributes": True}

    id: int
    username: str
    full_name: str
    role: UserRole
    email: Optional[str] = None
    phone_1: Optional[str] = None
    phone_2: Optional[str] = None
    is_active: bool
    created_at: datetime


# ── Warehouse Schemas ─────────────────────────────────────────
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
    model_config = {"from_attributes": True}

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


# ── Stock Schemas ─────────────────────────────────────────────
class StockCreate(BaseModel):
    brand_name: str
    brand_name_ta: Optional[str] = None
    rice_type: str
    rice_type_ta: Optional[str] = None
    production_company: Optional[str] = None
    production_company_ta: Optional[str] = None
    bag_weight_kg: float = 25.0

class StockUpdate(BaseModel):
    brand_name: Optional[str] = None
    brand_name_ta: Optional[str] = None
    rice_type: Optional[str] = None
    rice_type_ta: Optional[str] = None
    production_company: Optional[str] = None
    production_company_ta: Optional[str] = None
    bag_weight_kg: Optional[float] = None
    is_active: Optional[bool] = None

class StockOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    brand_name: str
    brand_name_ta: Optional[str] = None
    rice_type: str
    rice_type_ta: Optional[str] = None
    production_company: Optional[str] = None
    production_company_ta: Optional[str] = None
    bag_weight_kg: float
    is_active: bool
    created_at: datetime

class StockWithInventory(StockOut):
    remaining_bags: int = 0
    remaining_kg: float = 0.0
    total_inbound_bags: int = 0
    total_outbound_bags: int = 0


# ── Transaction Schemas ───────────────────────────────────────
class TransactionCreate(BaseModel):
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
    notes: Optional[str] = None
    quality_note: Optional[str] = None
    transaction_date: datetime

    @field_validator("quantity_bags")
    @classmethod
    def bags_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be positive")
        return v

class TransactionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    stock_id: int
    warehouse_id: int
    transaction_type: TransactionType
    quantity_bags: int
    quantity_kg: float
    quality_grade: QualityGrade
    source: Optional[str] = None
    sub_source: Optional[str] = None
    destination: Optional[str] = None
    sub_destination: Optional[str] = None
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    quality_note: Optional[str] = None
    transaction_date: datetime
    created_at: datetime
    stock: Optional[StockOut] = None
    warehouse: Optional[WarehouseOut] = None
    created_by_user: Optional[UserOut] = None


# ── TokenResponse ────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Dashboard Schemas ─────────────────────────────────────────
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

class StockLedger(BaseModel):
    stock: StockOut
    warehouse: WarehouseOut
    transactions: List[TransactionOut]
    opening_stock: int
    total_inbound: int
    total_outbound: int
    closing_stock: int
    closing_stock_kg: float


# ── Custom Quality Grade Schemas ──────────────────────────────
class CustomQualityGradeOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    grade_name: str

class CustomQualityGradeCreate(BaseModel):
    grade_name: str
