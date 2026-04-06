from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class TransactionType(str, enum.Enum):
    inbound = "inbound"   # Arrival / Unloading
    outbound = "outbound" # Dispatch / Sending


class QualityGrade(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"
    premium = "premium"
    standard = "standard"
    other = "other"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    full_name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    email = Column(String(255), nullable=True, unique=True)      # ← email for OTP
    phone_1 = Column(String(15), nullable=True)                   # kept for records
    phone_2 = Column(String(15), nullable=True)
    is_active = Column(Boolean, default=True)
    otp_secret = Column(String(32), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    transactions = relationship("Transaction", back_populates="created_by_user")


class Warehouse(Base):
    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String(100), unique=True, nullable=False)
    location_name_ta = Column(String(200), nullable=True)
    address = Column(Text, nullable=True)
    capacity = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transactions = relationship("Transaction", back_populates="warehouse")


class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)
    brand_name = Column(String(100), nullable=False)
    brand_name_ta = Column(String(200), nullable=True)
    rice_type = Column(String(100), nullable=False)
    rice_type_ta = Column(String(200), nullable=True)
    production_company = Column(String(100), nullable=True)
    production_company_ta = Column(String(200), nullable=True)
    bag_weight_kg = Column(Float, default=25.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    transactions = relationship("Transaction", back_populates="stock")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    transaction_type = Column(Enum(TransactionType), nullable=False)
    quantity_bags = Column(Integer, nullable=False)
    quantity_kg = Column(Float, nullable=False)
    quality_grade = Column(Enum(QualityGrade), default=QualityGrade.standard)
    source = Column(String(200), nullable=True)
    sub_source = Column(String(200), nullable=True)
    destination = Column(String(200), nullable=True)
    sub_destination = Column(String(200), nullable=True)
    vehicle_number = Column(String(20), nullable=True)
    notes = Column(Text, nullable=True)
    quality_note = Column(String(100), nullable=True)
    transaction_date = Column(DateTime(timezone=True), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    stock = relationship("Stock", back_populates="transactions")
    warehouse = relationship("Warehouse", back_populates="transactions")
    created_by_user = relationship("User", back_populates="transactions")


class OTPLog(Base):
    __tablename__ = "otp_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    otp_code = Column(String(6), nullable=False)
    email_used = Column(String(255), nullable=False)   # ← was phone_used
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CustomQualityGrade(Base):
    __tablename__ = "custom_quality_grades"

    id = Column(Integer, primary_key=True, index=True)
    grade_name = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
