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

# Ruta de la base de datos SQLite
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "..", "db.sqlite")
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Render a veces da "postgres://" en algunos lados; SQLAlchemy quiere "postgresql://"
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL or "sqlite:///./altium.db",
    connect_args={"check_same_thread": False} if not DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    """
    Usuarios de la aplicación (para login/registro).
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)      # 👈 dueño
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
    user_id = Column(String, nullable=False, index=True)      # 👈 dueño
    kind = Column(String, nullable=False)          # 'income' | 'expense'
    occurred_on = Column(Date, nullable=False)
    rubro = Column(String, nullable=True)          # rubro contable
    neto = Column(Numeric(14, 2), nullable=False)  # monto sin IVA
    iva = Column(Numeric(14, 2), nullable=True)    # IVA
    total = Column(Numeric(14, 2), nullable=False) # neto + iva
    description = Column(Text, nullable=True)
    document_id = Column(String, nullable=True)    # vínculo a documents.id


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)      # 👈 dueño
    year = Column(String, nullable=False)          # "2026"
    month = Column(String, nullable=False)         # "01"... "12"
    rubro = Column(String, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    kind = Column(String, nullable=False)          # 'income' | 'expense'


class StockSnapshot(Base):
    """
    Stock de mercaderías por período contable.
    EI y EF a valor de costo para cálculo de costo de ventas.
    """
    __tablename__ = "stock_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)      # 👈 dueño
    year = Column(String, nullable=False)          # "2025"
    month = Column(String, nullable=False)         # "01"... "12"
    initial_stock = Column(Numeric(14, 2), nullable=False, default=0)
    final_stock = Column(Numeric(14, 2), nullable=False, default=0)
