from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .db import init_db, SessionLocal, Transaction

import os, hashlib, csv
from datetime import datetime, timedelta
import datetime as dt
from decimal import Decimal
from typing import Literal
from sqlalchemy import func
from io import StringIO

# --------- App / Config ----------
STORAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "storage_cloud")
os.makedirs(STORAGE_PATH, exist_ok=True)

app = FastAPI(title="Altium Finanzas API (Cloud)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # en producción podés restringir al dominio de tu app
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


# --------- Modelos ----------
class UploadResponse(BaseModel):
    document_id: str
    ocr_preview: str
    parsed: dict | None = None


class ManualTransactionIn(BaseModel):
    date: dt.date
    kind: Literal["income", "expense"]  # ingreso o gasto
    rubro: str
    description: str | None = None
    total: Decimal  # monto total con IVA


# --------- Endpoints ----------

@app.post("/documents/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """
    Versión nube *sin OCR*:
    - Guarda el archivo en disco
    - No crea transacciones automáticas
    - Solo devuelve un mensaje informativo
    """
    if not file.filename:
        raise HTTPException(400, "Archivo inválido")

    data = await file.read()
    checksum = hashlib.sha256(data).hexdigest()
    path = os.path.join(STORAGE_PATH, f"{checksum}-{file.filename}")

    with open(path, "wb") as f:
        f.write(data)

    preview = (
        "Archivo almacenado correctamente. "
        "En esta versión web todavía no se leen automáticamente los montos del comprobante. "
        "Podés usar la carga manual o la importación histórica."
    )

    return {
        "document_id": checksum,
        "ocr_preview": preview,
        "parsed": None,
    }


@app.post("/transactions/manual")
def create_manual_transaction(payload: ManualTransactionIn):
    """
    Carga manual de ingresos/egresos.
    """
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
        document_id="manual-cloud",
    )
    db.add(trx)
    db.commit()
    db.refresh(trx)

    return {
        "id": trx.id,
        "message": "Transacción manual registrada correctamente (cloud).",
    }


@app.post("/transactions/import-csv")
async def import_transactions_csv(file: UploadFile = File(...)):
    """
    Importa movimientos históricos desde un CSV en uno de estos formatos:

    A) Formato detallado (fila a fila):
       date,kind,rubro,description,total

    B) Formato mensual por columnas:
       mes,ventas,compras,alquiler,sueldos,...

       - 'mes' puede ser: 'enero', 'febrero', ..., o '1', '01', etc.
       - Columnas 'ventas' o 'ingresos' se toman como ingresos (income)
       - Las demás columnas se toman como gastos (expense)
    """
    if not file.filename:
        raise HTTPException(400, "Archivo inválido")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    try:
        sample = "\n".join(text.splitlines()[:5]) or text
        dialect = csv.Sniffer().sniff(sample)
    except Exception:
        dialect = csv.excel

    f = StringIO(text)
    reader = csv.DictReader(f, dialect=dialect)

    if not reader.fieldnames:
        raise HTTPException(400, "El CSV no tiene encabezados.")

    headers = [h.strip().lower() for h in reader.fieldnames]

    db = SessionLocal()

    # -------- Rama A: formato fila a fila (date,kind,rubro,total) --------
    if {"date", "kind", "rubro", "total"}.issubset(set(headers)):
        imported = 0
        skipped = 0

        for row in reader:
            try:
                raw_date = (row.get("date") or "").strip()
                if not raw_date:
                    raise ValueError("Fecha vacía")

                if "-" in raw_date:
                    occurred_on = dt.datetime.strptime(raw_date, "%Y-%m-%d").date()
                elif "/" in raw_date:
                    occurred_on = dt.datetime.strptime(raw_date, "%d/%m/%Y").date()
                else:
                    occurred_on = dt.datetime.fromisoformat(raw_date).date()

                kind = (row.get("kind") or "").strip().lower()
                if kind not in ("income", "expense"):
                    raise ValueError("kind inválido")

                rubro = (row.get("rubro") or "").strip() or "Sin rubro"
                description = (row.get("description") or "").strip() or "Importado CSV"

                total_str = (row.get("total") or "").strip()
                if not total_str:
                    raise ValueError("total vacío")
                total = Decimal(total_str.replace(".", "").replace(",", "."))
                total = total.quantize(Decimal("0.01"))

                iva = (total * Decimal("0.22")).quantize(Decimal("0.01"))
                neto = (total - iva).quantize(Decimal("0.01"))

            except Exception:
                skipped += 1
                continue

            trx = Transaction(
                kind=kind,
                occurred_on=occurred_on,
                rubro=rubro,
                neto=neto,
                iva=iva,
                total=total,
                description=description[:240],
                document_id="import-csv-cloud",
            )
            db.add(trx)
            imported += 1

        db.commit()
        return {
            "imported": imported,
            "skipped": skipped,
            "message": f"Importadas {imported} filas (formato detallado), saltadas {skipped}.",
        }

    # -------- Rama B: formato mensual (mes, ventas, compras, ...) --------
    if "mes" not in headers:
        raise HTTPException(
            400,
            "El CSV no tiene formato reconocido. Se espera 'date,kind,rubro,total' "
            "o bien 'mes, ventas, compras, ...'.",
        )

    month_map = {
        "enero": 1,
        "febrero": 2,
        "marzo": 3,
        "abril": 4,
        "mayo": 5,
        "junio": 6,
        "julio": 7,
        "agosto": 8,
        "setiembre": 9,
        "septiembre": 9,
        "octubre": 10,
        "noviembre": 11,
        "diciembre": 12,
    }

    def parse_month(mes_raw: str) -> int:
        s = mes_raw.strip().lower()
        if s.isdigit():
            val = int(s)
            if 1 <= val <= 12:
                return val
        if s in month_map:
            return month_map[s]
        raise ValueError(f"Mes inválido: {mes_raw!r}")

    current_year = dt.date.today().year

    imported = 0
    skipped = 0
    ignore_cols = {"mes", "año", "anio", ""}

    for row in reader:
        try:
            raw_mes = (row.get("mes") or "").strip()
            if not raw_mes:
                raise ValueError("Mes vacío")

            month_num = parse_month(raw_mes)

            raw_year = (row.get("año") or row.get("anio") or "").strip()
            if raw_year.isdigit():
                year = int(raw_year)
            else:
                year = current_year

            first_day = dt.date(year, month_num, 1)
            if month_num == 12:
                next_month_first = dt.date(year + 1, 1, 1)
            else:
                next_month_first = dt.date(year, month_num + 1, 1)
            occurred_on = next_month_first - dt.timedelta(days=1)

            for col_name in reader.fieldnames or []:
                col_key = (col_name or "").strip()
                col_norm = col_key.lower()
                if col_norm in ignore_cols:
                    continue

                val_str = (row.get(col_name) or "").strip()
                if not val_str:
                    continue

                try:
                    total = Decimal(val_str.replace(".", "").replace(",", "."))
                except Exception:
                    continue

                if total == 0:
                    continue

                total = total.quantize(Decimal("0.01"))
                iva = (total * Decimal("0.22")).quantize(Decimal("0.01"))
                neto = (total - iva).quantize(Decimal("0.01"))

                if col_norm in ("ventas", "ingresos", "ventas totales"):
                    kind = "income"
                else:
                    kind = "expense"

                rubro = col_key or "Sin rubro"
                description = f"Histórico {raw_mes} - {rubro}"

                trx = Transaction(
                    kind=kind,
                    occurred_on=occurred_on,
                    rubro=rubro,
                    neto=neto,
                    iva=iva,
                    total=total,
                    description=description[:240],
                    document_id="import-csv-cloud",
                )
                db.add(trx)
                imported += 1

        except Exception:
            skipped += 1
            continue

    db.commit()

    return {
        "imported": imported,
        "skipped": skipped,
        "message": f"Importadas {imported} filas (formato mensual), meses con error {skipped}.",
    }


@app.get("/analytics/income-statement")
def income_statement(year: int = Query(...), month: int = Query(...)):
    db = SessionLocal()

    ym = f"{year:04d}-{month:02d}"
    base = datetime(year, month, 1)
    prev_dt = base - timedelta(days=1)
    ym_prev = f"{prev_dt.year:04d}-{prev_dt.month:02d}"

    def period_agg(yyyy_mm: str):
        rows = (
            db.query(
                Transaction.rubro,
                Transaction.kind,
                func.sum(Transaction.neto).label("neto"),
                func.sum(Transaction.iva).label("iva"),
                func.sum(Transaction.total).label("total"),
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

    cur = period_agg(ym)
    prv = period_agg(ym_prev)

    cur_income = sum(x["total"] for x in cur if x["kind"] == "income")
    cur_exp = sum(x["total"] for x in cur if x["kind"] == "expense")
    prv_income = sum(x["total"] for x in prv if x["kind"] == "income")
    prv_exp = sum(x["total"] for x in prv if x["kind"] == "expense")

    summary = {
        "income": cur_income,
        "expense": cur_exp,
        "margin": cur_income - cur_exp,
        "prev_income": prv_income,
        "prev_expense": prv_exp,
        "prev_margin": prv_income - prv_exp,
        "mom_income_pct": ((cur_income - prv_income) / prv_income * 100.0)
        if prv_income
        else None,
        "mom_expense_pct": ((cur_exp - prv_exp) / prv_exp * 100.0)
        if prv_exp
        else None,
        "margin_pct": ((cur_income - cur_exp) / cur_income * 100.0)
        if cur_income
        else None,
    }

    return {
        "period": ym,
        "previous": ym_prev,
        "by_rubro": cur,
        "summary": summary,
    }


@app.get("/budget/suggest")
def budget_suggest(
    year: int = Query(...), month: int = Query(...), window_months: int = 6
):
    db = SessionLocal()

    target_first = datetime(year, month, 1)

    y = year
    m = month
    for _ in range(window_months):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    window_start = datetime(y, m, 1).date()
    window_end = target_first.date()

    rows = (
        db.query(
            Transaction.rubro,
            Transaction.kind,
            func.sum(Transaction.total).label("total"),
        )
        .filter(
            Transaction.occurred_on >= window_start,
            Transaction.occurred_on < window_end,
        )
        .group_by(Transaction.rubro, Transaction.kind)
        .all()
    )

    lines = []
    for rubro, kind, total in rows:
        total_val = float(total or 0.0)
        suggested = (
            total_val / float(window_months) if window_months > 0 else total_val
        )
        lines.append(
            {
                "rubro": rubro or "Sin rubro",
                "kind": kind,
                "suggested": suggested,
            }
        )

    return {
        "period": f"{year:04d}-{month:02d}",
        "window_months": window_months,
        "from": window_start.isoformat(),
        "to_exclusive": window_end.isoformat(),
        "lines": lines,
    }
