from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserRole
from schemas import LoginRequest, OTPVerifyRequest, TokenResponse, OTPSendResponse, UserOut
from utils.security import verify_password, create_access_token, generate_session_token, hash_password
from utils.otp import create_and_send_otp, verify_otp, mask_email
from utils.deps import get_current_user
import os

router = APIRouter()

# Temporary in-memory session store (use Redis in production)
_otp_sessions: dict = {}

DEFAULT_ADMIN_EMAIL = os.getenv("DEFAULT_ADMIN_EMAIL", "admin@ricewarehouse.local")


@router.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        User.username == request.username,
        User.is_active == True
    ).first()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    if user.role == UserRole.admin:
        # Ensure admin always has an email
        if not user.email:
            user.email = DEFAULT_ADMIN_EMAIL
            db.commit()

        otp, email = create_and_send_otp(user, db)
        session_token = generate_session_token()
        _otp_sessions[session_token] = {"user_id": user.id}
        return OTPSendResponse(
            session_token=session_token,
            message="OTP sent to registered email",
            email_masked=mask_email(email)
        )
    else:
        # Regular users log in directly (no OTP)
        token = create_access_token({"sub": str(user.id), "role": user.role.value})
        return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp_endpoint(request: OTPVerifyRequest, db: Session = Depends(get_db)):
    session = _otp_sessions.get(request.session_token)
    if not session:
        raise HTTPException(status_code=400, detail="Invalid or expired session")

    user = db.query(User).filter(User.id == session["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_otp(user.id, request.otp_code, db):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    del _otp_sessions[request.session_token]

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/resend-otp")
def resend_otp(session_token: str, db: Session = Depends(get_db)):
    session = _otp_sessions.get(session_token)
    if not session:
        raise HTTPException(status_code=400, detail="Invalid session")

    user = db.query(User).filter(User.id == session["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp, email = create_and_send_otp(user, db)
    return {"message": "OTP resent", "email_masked": mask_email(email)}


@router.post("/seed-admin")
def seed_admin(db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.role == UserRole.admin).first()
    if existing:
        raise HTTPException(status_code=400, detail="Admin already exists")

    admin = User(
        username="Admin",
        full_name="Warehouse Admin",
        password_hash=hash_password("Admin@1234"),
        role=UserRole.admin,
        email=DEFAULT_ADMIN_EMAIL,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return {"message": "Admin created", "username": "Admin", "password": "Admin@1234", "email": DEFAULT_ADMIN_EMAIL}
