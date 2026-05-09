# backend/database.py
import os
import logging
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ============================================================
# DATABASE URL RESOLUTION
# ============================================================
DATABASE_URL = os.getenv("DATABASE_URL")

# 🔥 Force safe fallback if Railway internal URL or missing
if not DATABASE_URL or "railway.internal" in DATABASE_URL:
    logger.warning("DATABASE_URL missing or internal — falling back to SQLite")
    DATABASE_URL = "sqlite:///./rice_warehouse.db"

# Fix postgres:// → postgresql:// (Railway / Heroku quirk)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Strip ?pgbouncer=true — psycopg2 does not understand this query param.
# PgBouncer compatibility is handled via SQLAlchemy engine options below.
if "pgbouncer" in DATABASE_URL:
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
    _parsed = urlparse(DATABASE_URL)
    _qs = {k: v for k, v in parse_qs(_parsed.query).items() if k != "pgbouncer"}
    DATABASE_URL = urlunparse(_parsed._replace(query=urlencode(_qs, doseq=True)))

# Optional: force psycopg driver if you've installed it (Postgres 17+)
# if DATABASE_URL.startswith("postgresql://") and os.getenv("USE_PSYCOPG3") == "1":
#     DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")
IS_POSTGRES = DATABASE_URL.startswith("postgresql")

# ============================================================
# ENGINE
# ============================================================
ENGINE_KWARGS = {
    "echo": os.getenv("SQL_ECHO", "0") == "1",
    "future": True,
}

if IS_SQLITE:
    # SQLite: single-thread guard off, single shared connection for tests
    ENGINE_KWARGS["connect_args"] = {"check_same_thread": False}
    # If using in-memory ":memory:" force StaticPool so all sessions share it
    if ":memory:" in DATABASE_URL:
        ENGINE_KWARGS["poolclass"] = StaticPool
else:
    # Postgres / MySQL etc.
    ENGINE_KWARGS.update({
        "pool_pre_ping": True,        # avoid stale connections
        "pool_size": int(os.getenv("DB_POOL_SIZE", "5")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "10")),
        "pool_recycle": int(os.getenv("DB_POOL_RECYCLE", "1800")),  # recycle after 30 min
        "pool_timeout": int(os.getenv("DB_POOL_TIMEOUT", "30")),
    })

engine = create_engine(DATABASE_URL, **ENGINE_KWARGS)


# ============================================================
# SQLITE: enforce foreign keys + WAL + faster sync
# (Critical for our new schema — many FKs, ON DELETE CASCADE)
# ============================================================
if IS_SQLITE:
    @event.listens_for(Engine, "connect")
    def _sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA temp_store=MEMORY")
            cursor.execute("PRAGMA busy_timeout=5000")  # wait up to 5s on locks
        finally:
            cursor.close()


# ============================================================
# SESSION
# ============================================================
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,   # keep ORM objects usable after commit (better for FastAPI responses)
)

Base = declarative_base()


# ============================================================
# DEPENDENCY (FastAPI)
# ============================================================
def get_db():
    """
    Yields a SQLAlchemy session per request and guarantees close.
    Rolls back on exception so partial writes don't leak.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ============================================================
# UTILITIES
# ============================================================
def init_db() -> None:
    """
    Create all tables defined on Base.metadata.
    Called on app startup (only if not using Alembic migrations).
    Safe to run repeatedly — no-op if tables exist.
    """
    # Import models so SQLAlchemy registers them with Base.metadata
    import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ensured (%s)", "SQLite" if IS_SQLITE else "Postgres")


def get_db_info() -> dict:
    """Quick health-check info for /health endpoint."""
    return {
        "dialect": engine.dialect.name,
        "driver": engine.dialect.driver,
        "url_safe": _safe_url(DATABASE_URL),
        "pool_size": getattr(engine.pool, "size", lambda: None)(),
    }


def _safe_url(url: str) -> str:
    """Mask password in DB URL for logs/health output."""
    if "@" not in url:
        return url
    try:
        scheme, rest = url.split("://", 1)
        creds, host = rest.split("@", 1)
        if ":" in creds:
            user, _ = creds.split(":", 1)
            return f"{scheme}://{user}:****@{host}"
        return url
    except Exception:
        return "***"