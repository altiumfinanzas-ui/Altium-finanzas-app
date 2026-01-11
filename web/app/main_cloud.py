from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Literal
from decimal import Decimal
from datetime import date, datetime, timedelta
from sqlalchemy import func

from db import init_db, SessionLocal, Transaction, Stock  # 👈 ajustá si tu db.py está en otro path

# ===============================
# App
# ===============================

app = FastAPI(title="Altium Finanzas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # en prod: dominio del front
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

# ===============================
# MODELOS
# ===============================

class ManualTransactionIn(BaseModel):
    date: date
    kind: Literal["income", "expense"]
    rubro: str
    description: str | None = None
    total: Decimal

class StockIn(BaseModel):
    initial_stock: Decimal
    final_stock: Decimal

# ===============================
# ENDPOINTS
# ===============================

@app.post("/transactions/manual")
def create_manual_transaction(payload: ManualTransactionIn):
    db = SessionLocal()

    total = payload.total.quantize(Decimal("0.01"))
    iva = (total * Decimal("0.22")).quantize(Decimal("0.01"))
    neto = (total - iva).quantize(Decimal("0.01"))

    trx = Transaction(
        kind=payload.kind,
        occurred_on=payload.date,
        rubro=payload.rubro,
        neto=neto,
        iva=iva,
        total=total,
        description=payload.description or "Carga manual",
        document_id="manual",
    )

    db.add(trx)
    db.commit()
    db.refresh(trx)

    return {"id": trx.id, "message": "Transacción creada"}

# ===============================
# STOCK
# ===============================

@app.get("/stock")
def get_stock(year: int = Query(...), month: int = Query(...)):
    db = SessionLocal()

    row = (
        db.query(Stock)
        .filter(Stock.year == year, Stock.month == month)
        .first()
    )

    if not row:
        return {
            "year": year,
            "month": month,
            "initial_stock": None,
            "final_stock": None,
        }

    return {
        "year": year,
        "month": month,
        "initial_stock": float(row.initial_stock),
        "final_stock": float(row.final_stock),
    }

@app.post("/stock")
def save_stock(
    year: int = Query(...),
    month: int = Query(...),
    payload: StockIn = ...
):
    db = SessionLocal()

    row = (
        db.query(Stock)
        .filter(Stock.year == year, Stock.month == month)
        .first()
    )

    if not row:
        row = Stock(year=year, month=month)

    row.initial_stock = payload.initial_stock
    row.final_stock = payload.final_stock

    db.add(row)
    db.commit()

    return {"message": "Stock guardado"}

# ===============================
# ESTADO DE RESULTADOS
# ===============================

@app.get("/analytics/income-statement")
def income_statement(year: int = Query(...), month: int = Query(...)):
    db = SessionLocal()

    ym = f"{year:04d}-{month:02d}"
    base = date(year, month, 1)
    prev = base - timedelta(days=1)
    ym_prev = f"{prev.year:04d}-{prev.month:02d}"

    def aggregate(yyyy_mm: str):
        rows = (
            db.query(
                Transaction.rubro,
                Transaction.kind,
                func.sum(Transaction.neto),
                func.sum(Transaction.iva),
                func.sum(Transaction.total),
            )
            .filter(func.strftime("%Y-%m", Transaction.occurred_on) == yyyy_mm)
            .group_by(Transaction.rubro, Transaction.kind)
            .all()
        )

        return [
            {
                "rubro": r[0] or "Sin rubro",
                "kind": r[1],
                "neto": float(r[2] or 0),
                "iva": float(r[3] or 0),
                "total": float(r[4] or 0),
            }
            for r in rows
        ]

    cur = aggregate(ym)
    prev_rows = aggregate(ym_prev)

    income = sum(x["total"] for x in cur if x["kind"] == "income")
    expense = sum(x["total"] for x in cur if x["kind"] == "expense")

    prev_income = sum(x["total"] for x in prev_rows if x["kind"] == "income")
    prev_expense = sum(x["total"] for x in prev_rows if x["kind"] == "expense")

    return {
        "period": ym,
        "previous": ym_prev,
        "by_rubro": cur,
        "summary": {
            "income": income,
            "expense": expense,
            "margin": income - expense,
            "prev_income": prev_income,
            "prev_expense": prev_expense,
            "prev_margin": prev_income - prev_expense,
            "margin_pct": (income - expense) / income * 100 if income else None,
        },
    }
