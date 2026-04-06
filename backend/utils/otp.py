from dotenv import load_dotenv
load_dotenv()

import os
import logging
import smtplib
import ssl
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from models import OTPLog, User
from utils.security import generate_otp

logger = logging.getLogger(__name__)

# Email config via environment
SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM    = os.getenv("EMAIL_FROM", SMTP_USER)
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME", "Rice Warehouse")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

OTP_EXPIRY_MINUTES = 10


def get_otp_html(otp: str, full_name: str) -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:40px 20px;">
          <table width="480" cellpadding="0" cellspacing="0"
                 style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;text-align:center;">
                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
                  🌾 Rice Warehouse Management
                </h1>
                <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Secure Login Verification</p>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px;">
                <p style="margin:0 0 8px;color:#374151;font-size:15px;">Hello, <strong>{full_name}</strong></p>
                <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.6;">
                  Your one-time password (OTP) for logging in:
                </p>
                <div style="text-align:center;margin:0 0 28px;">
                  <span style="display:inline-block;background:#eff6ff;border:2px solid #3b82f6;
                               border-radius:12px;padding:18px 40px;
                               font-size:38px;font-weight:800;letter-spacing:12px;color:#1e40af;">
                    {otp}
                  </span>
                </div>
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-align:center;">
                  ⏰ Valid for <strong>{OTP_EXPIRY_MINUTES} minutes</strong> only.
                </p>
                <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">
                  Do not share this code with anyone.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
                <p style="margin:0;color:#9ca3af;font-size:12px;">
                  Rice Warehouse Management System
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    """


def send_via_resend(email: str, otp: str, full_name: str) -> bool:
    """Send OTP via Resend API (works on Railway)."""
    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "from": f"{EMAIL_FROM_NAME} <onboarding@resend.dev>",
                "to": [email],
                "subject": "Rice Warehouse – Your Login OTP",
                "html": get_otp_html(otp, full_name)
            },
            timeout=30
        )
        if response.status_code == 200:
            logger.info(f"OTP email sent via Resend to {email}")
            return True
        else:
            logger.error(f"Resend error: {response.text}")
            return False
    except Exception as e:
        logger.error(f"Resend API error: {e}")
        return False


def send_via_smtp(email: str, otp: str, full_name: str) -> bool:
    """Send OTP via SMTP (works locally)."""
    subject = "Rice Warehouse – Your Login OTP"
    html_body = get_otp_html(otp, full_name)
    text_body = f"Your Rice Warehouse OTP is: {otp}\nValid for {OTP_EXPIRY_MINUTES} minutes."

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM}>"
        msg["To"] = email
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        context = ssl.create_default_context()

        # Try SSL first (port 465)
        try:
            with smtplib.SMTP_SSL(SMTP_HOST, 465, context=context, timeout=10) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(EMAIL_FROM, email, msg.as_string())
            logger.info(f"OTP sent via SMTP SSL to {email}")
            return True
        except Exception:
            pass

        # Fallback TLS (port 587)
        with smtplib.SMTP(SMTP_HOST, 587, timeout=10) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(EMAIL_FROM, email, msg.as_string())
        logger.info(f"OTP sent via SMTP TLS to {email}")
        return True

    except Exception as e:
        logger.error(f"SMTP failed: {e}")
        return False


def send_otp_email(email: str, otp: str, full_name: str = "Admin") -> bool:
    """Send OTP — tries Resend API first, then SMTP, then dev mode."""
    
    # Method 1: Resend API (works on Railway)
    if RESEND_API_KEY:
        return send_via_resend(email, otp, full_name)
    
    # Method 2: SMTP (works locally)
    if SMTP_USER and SMTP_PASSWORD:
        return send_via_smtp(email, otp, full_name)
    
    # Method 3: Dev mode
    logger.warning(f"[DEV MODE] OTP for {email}: {otp}")
    print(f"\n{'='*50}\n[DEV MODE] OTP for {email}: {otp}\n{'='*50}\n")
    return True


def mask_email(email: str) -> str:
    if not email or "@" not in email:
        return "****@****.com"
    local, domain = email.split("@", 1)
    masked_local = local[0] + "*" * max(2, len(local) - 1)
    domain_parts = domain.split(".", 1)
    masked_domain = domain_parts[0][0] + "*" * max(2, len(domain_parts[0]) - 1)
    ext = "." + domain_parts[1] if len(domain_parts) > 1 else ""
    return f"{masked_local}@{masked_domain}{ext}"


def create_and_send_otp(user: User, db: Session) -> tuple[str, str]:
    email = user.email
    if not email:
        raise ValueError("No email address registered for this admin")

    otp = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)

    db.query(OTPLog).filter(
        OTPLog.user_id == user.id,
        OTPLog.is_used == False
    ).update({"is_used": True})

    otp_log = OTPLog(
        user_id=user.id,
        otp_code=otp,
        email_used=email,
        expires_at=expires_at
    )
    db.add(otp_log)
    db.commit()

    send_otp_email(email, otp, user.full_name)
    return otp, email


def verify_otp(user_id: int, otp_code: str, db: Session) -> bool:
    otp_log = db.query(OTPLog).filter(
        OTPLog.user_id == user_id,
        OTPLog.otp_code == otp_code,
        OTPLog.is_used == False,
        OTPLog.expires_at > datetime.utcnow()
    ).first()

    if not otp_log:
        return False

    otp_log.is_used = True
    db.commit()
    return True