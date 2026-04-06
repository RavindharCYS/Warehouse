import bcrypt
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
import secrets
import random
import string
import os

SECRET_KEY = os.getenv("SECRET_KEY", "rice-warehouse-secret-key-change-in-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 7 days — no auto-logout


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def generate_otp(length: int = 6) -> str:
    return ''.join(random.choices(string.digits, k=length))


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def mask_phone(phone: str) -> str:
    if not phone or len(phone) < 4:
        return "****"
    return phone[:2] + "*" * (len(phone) - 4) + phone[-2:]
