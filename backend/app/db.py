import os
from sqlalchemy import create_engine, Column, String, Date, DateTime, Text, Numeric
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import uuid

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "..", "db.sqlite")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

def init_db():
    Base.metadata.create_all(engine)

class Document(Base):
    __tablename__ = "documents"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
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
    year = Column(String, nullable=False)          # "2026"
    month = Column(String, nullable=False)         # "01"... "12"
    rubro = Column(String, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False, default=0)
    kind = Column(String, nullable=False)          # 'income' | 'expense'
