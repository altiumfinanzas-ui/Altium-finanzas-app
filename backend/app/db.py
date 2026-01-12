import os
from sqlalchemy import (
    create_engine,
    Column,
    String,
    Date,
    DateTime,
    Text,
    Numeric,
    Boolean,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import uuid

# Base directory del backend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Database URL (Render usa DATABASE_URL; local usa SQLite)
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Render a veces da "postgres://" y SQLAlchemy quiere "postgresql://"
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL or f"sqlite:///{os.path.join(BASE_DIR, 'altium.db')}",
    connect_args={"check_same_thread": False} if not DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# =========================
# MODELOS
# =========================

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    storage_key = Column(String, nullable=False)
    original_filename = Column(String)
    mime_type = Column(String)
    checksum = Column(String)
    status = Column(String, default="ready")
    ocr_text = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    kind = Column(String, nullable=False)  # income | expense
    occurred_on = Column(Date, nullable=False)
    rubro = Column(String, nullable=True)
    neto = Column(Numeric(14, 2), nullable=False)
    iva = Column(Numeric(14, 2), nullable=True)
    total = Column(Numeric(14, 2), nullable=False)
    description = Column(Text, nullable=True)
    document_id = Column(String, nullable=True)


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    year = Column(String, nullable=False)
    month = Column(String, nullable=False)
    rubro = Column(String, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    kind = Column(String, nullable=False)


class StockSnapshot(Base):
    __tablename__ = "stock_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    year = Column(String, nullable=False)
    month = Column(String, nullable=False)
    initial_stock = Column(Numeric(14, 2), nullable=False, default=0)
    final_stock = Column(Numeric(14, 2), nullable=False, default=0)


# =========================
# INIT DB
# =========================

def init_db():
    """
    Crea las tablas si no existen.
    Llamado desde main.py al arrancar la app.
    """
    Base.metadata.create_all(bind=engine)
