# backend/app/main.py

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import router as auth_router, get_current_user
from .db import (
    init_db,
    SessionLocal,
    User,
    Document,
    Transaction,
    StockSnapshot,
)

import os
import hashlib
import re
import csv
import platform
from io import BytesIO, StringIO
from datetime import datetime, timedelta
import datetime as dt
from decimal import Decimal
from typing import Optional, Literal

from sqlalchemy import func

# OCR / imágenes / PDF
import pytesseract
from PIL import Image, ImageOps, ImageFilter
import fitz  # PyMuPDF


# ==========================
# Configuración Tesseract
# ==========================

if platform.system() == "Windows":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


# ==========================
# Funciones de OCR
# ==========================

def ocr_image_bytes(data: bytes) -> str:
    """OCR sobre imagen con preprocesado básico (sin OpenCV)."""
    try:
        img = Image.open(BytesIO(data))
    except Exception:
        return ""
    try:
        img = img.convert("L")
        w, h = img.size
        img = img.resize((max(1, w * 2), max(1, h * 2)))  # upsample ~>300dpi
        img = ImageOps.autocontrast(img)
        img = img.filter(ImageFilter.MedianFilter(size=3))

        hist = img.histogram()
        thr = 180 if sum(hist[:128]) < sum(hist[128:]) else 150
        img = img.point(lambda p: 255 if p > thr else 0)

        cfg = "--oem 1 --psm 6 -c preserve_interword_spaces=1"
        text = pytesseract.image_to_string(img, lang="spa+eng", config=cfg)
        return (text or "").strip()
    except Exception:
        return ""


def ocr_pdf_bytes(data: bytes) -> str:
    """PDF: intenta texto nativo; si no, rasteriza y hace OCR."""
    parts: list[str] = []
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        return ""
    for page in doc:
        t = (page.get_text("text") or "").strip()
        if len(t) >= 25:
            parts.append(t)
            continue
        try:
            pix = page.get_pixmap(dpi=300, alpha=False)
            pil_img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            buf = BytesIO()
            pil_img.save(buf, format="PNG")
            t_ocr = ocr_image_bytes(buf.getvalue())
            if t_ocr:
                parts.append(t_ocr)
        except Exception:
            pass
    return "\n\n".join(parts).strip()


# ==========================
# Helpers de parsing contable
# ==========================

def extract_date(text: str) -> str:
    m = re.search(
        r"(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})",
        text,
    )
    if not m:
        return dt.date.today().isoformat()
    raw = m.group(0).replace("/", "-").replace(".", "-")
    parts = raw.split("-")
    try:
        if len(parts[0]) == 4:
            return dt.datetime.strptime(raw, "%Y-%m-%d").date().isoformat()
        else:
            return dt.datetime.strptime(raw, "%d-%m-%Y").date().isoformat()
    except Exception:
        return dt.date.today().isoformat()


def parse_rubro(text: str) -> Optional[str]:
    keywords = {
        "alquiler": "Alquiler",
        "rent": "Alquiler",
        "luz": "Servicios",
        "ute": "Servicios",
        "energ": "Servicios",
        "agua": "Servicios",
        "ose": "Servicios",
        "internet": "Servicios",
        "telefon": "Servicios",
        "combust": "Movilidad",
        "nafta": "Movilidad",
        "gasol": "Movilidad",
        "proveed": "Mercaderías",
        "insumo": "Insumos",
        "materia prima": "Insumos",
        "venta": "Ventas",
        "ingreso": "Ventas",
        "factura": "Ventas",
    }
    lo = text.lower()
    for k, v in keywords.items():
        if k in lo:
            return v
    return None


def parse_iva_y_neto(
    text: str,
) -> tuple[Optional[Decimal], Optional[Decimal], Optional[Decimal]]:
    nums = re.findall(r"\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})", text)
    if not nums:
        return None, None, None
    vals = [Decimal(n.replace(".", "").replace(",", ".")) for n in nums]
    total = max(vals)

    m_iva = re.search(r"iva[^0-9]*([\d.,]{1,15})", text.lower())
    if m_iva:
        iva = Decimal(m_iva.group(1).replace(".", "").replace(",", "."))
        neto = total - iva
        return (
            iva.quantize(Decimal("0.01")),
            neto.quantize(Decimal("0.01")),
            total.quantize(Decimal("0.01")),
        )

    iva = (total * Decimal("0.22")).quantize(Decimal("0.01"))
    neto = (total - iva).quantize(Decimal("0.01"))
    return iva, neto, total.quantize(Decimal("0.01"))


# ==========================
# Configuración general app
# ==========================

STORAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "storage")
os.makedirs(STORAGE_PATH, exist_ok=True)

app = FastAPI(title="Altium Finanzas API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://altium-finanzas-app.vercel.app",
        "https://altium-finanzas-app-git-main.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth", tags=["auth"])


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def root():
    return {"status": "ok", "message": "Altium Finanzas API funcionando"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ==========================
# Pydantic models
# ==========================

class UploadResponse(BaseModel):
    document_id: str
    ocr_preview: str
    parsed: Optional[dict] = None


class ManualTransactionIn(BaseModel):
    date: dt.date
    kind: Literal["income", "expense"]
    rubro: str
    description: Optional[str] = None
    total: Decimal


class StockIn(BaseModel):
    initial_stock: Decimal
    final_stock: Decimal


# ==========================
# Endpoints: stock (EI/EF)
# ==========================

@app.get("/stock")
def get_stock(
    year: int = Query(...),
    month: int = Query(...),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        ym = f"{year:04d}"
        mm = f"{month:02d}"

        snap = (
            db.query(StockSnapshot)
            .filter(
                StockSnapshot.user_id == current_user.id,
                StockSnapshot.year == ym,
                StockSnapshot.month == mm,
            )
            .first()
        )
        if not snap:
            return {
                "year": year,
                "month": month,
                "initial_stock": None,
                "final_stock": None,
            }

        return {
            "year": year,
            "month": month,
            "initial_stock": float(snap.initial_stock or 0),
            "final_stock": float(snap.final_stock or 0),
        }
    finally:
        db.close()


@app.post("/stock")
def upsert_stock(
    year: int = Query(...),
    month: int = Query(...),
    payload: StockIn = None,
    current_user: User = Depends(get_current_user),
):
    if payload is None:
        raise HTTPException(400, "Falta payload de stock")

    db = SessionLocal()
    try:
        ym = f"{year:04d}"
        mm = f"{month:02d}"

        snap = (
            db.query(StockSnapshot)
            .filter(
                StockSnapshot.user_id == current_user.id,
                StockSnapshot.year == ym,
                StockSnapshot.month == mm,
            )
            .first()
        )

        if not snap:
            snap = StockSnapshot(
                user_id=current_user.id,
                year=ym,
                month=mm,
            )
            db.add(snap)

        snap.initial_stock = payload.initial_stock.quantize(Decimal("0.01"))
        snap.final_stock = payload.final_stock.quantize(Decimal("0.01"))

        db.commit()
        db.refresh(snap)

        return {
            "year": year,
            "month": month,
            "initial_stock": float(snap.initial_stock or 0),
            "final_stock": float(snap.final_stock or 0),
            "message": "Stock actualizado correctamente",
        }
    finally:
        db.close()


# ==========================
# Endpoints: documentos / OCR
# ==========================

@app.post("/documents/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(400, "Archivo inválido")

    data = await file.read()
    checksum = hashlib.sha256(data).hexdigest()
    path = os.path.join(STORAGE_PATH, f"{checksum}-{file.filename}")

    with open(path, "wb") as f:
        f.write(data)

    filename = (file.filename or "").lower()
    mime = (file.content_type or "").lower()
    if filename.endswith(".pdf") or "pdf" in mime:
        ocr_text = ocr_pdf_bytes(data)
    else:
        ocr_text = ocr_image_bytes(data)

    db = SessionLocal()
    try:
        doc = Document(
            user_id=current_user.id,
            storage_key=path,
            original_filename=file.filename,
            mime_type=file.content_type or "application/octet-stream",
            checksum=checksum,
            status="ready",
            ocr_text=ocr_text,
            created_at=datetime.utcnow(),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        occurred_on = extract_date(ocr_text or "")
        rubro = parse_rubro(ocr_text or "") or "Sin clasificar"
        iva, neto, total = parse_iva_y_neto(ocr_text or "")
        if iva is None or neto is None or total is None:
            iva, neto, total = Decimal("0.00"), Decimal("0.00"), Decimal("0.00")

        kind = "expense"
        tlow = (ocr_text or "").lower()
        if "venta" in tlow or "ingreso" in tlow:
            kind = "income"

        trx = Transaction(
            user_id=current_user.id,
            kind=kind,
            occurred_on=dt.datetime.fromisoformat(occurred_on).date(),
            rubro=rubro,
            neto=neto,
            iva=iva,
            total=total,
            description=(ocr_text or "")[:240],
            document_id=str(doc.id),
        )
        db.add(trx)
        db.commit()

        preview = (ocr_text or "").replace("\n", " ").strip()
        if len(preview) > 160:
            preview = preview[:160] + "..."

        parsed = {
            "date": occurred_on,
            "kind": kind,
            "rubro": rubro,
            "neto": str(neto),
            "iva": str(iva),
            "total": str(total),
        }
        return UploadResponse(
            document_id=str(doc.id),
            ocr_preview=preview,
            parsed=parsed,
        )
    finally:
        db.close()


# ==========================
# EERR / Analytics
# ==========================

@app.get("/analytics/income-statement")
def income_statement(
    year: int = Query(...),
    month: int = Query(...),
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
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
                .filter(
                    Transaction.user_id == current_user.id,
                    func.strftime("%Y-%m", Transaction.occurred_on) == yyyy_mm,
                )
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

        purchases_total = sum(
            x["total"]
            for x in cur
            if x["kind"] == "expense" and x["rubro"].lower() in ("mercaderías", "mercaderias")
        )

        snap = (
            db.query(StockSnapshot)
            .filter(
                StockSnapshot.user_id == current_user.id,
                StockSnapshot.year == f"{year:04d}",
                StockSnapshot.month == f"{month:02d}",
            )
            .first()
        )

        if snap:
            ei = float(snap.initial_stock or 0)
            ef = float(snap.final_stock or 0)
            cogs = ei + purchases_total - ef
            gross_margin = cur_income - cogs
            gross_margin_pct = (gross_margin / cur_income * 100.0) if cur_income else None
        else:
            ei = ef = cogs = gross_margin = gross_margin_pct = None

        summary = {
            "income": cur_income,
            "expense": cur_exp,
            "margin": cur_income - cur_exp,
            "purchases": purchases_total,
            "initial_stock": ei,
            "final_stock": ef,
            "cogs": cogs,
            "gross_margin": gross_margin,
            "gross_margin_pct": gross_margin_pct,
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
    finally:
        db.close()


# ==========================
# Presupuesto sugerido
# ==========================

@app.get("/budget/suggest")
def budget_suggest(
    year: int = Query(...),
    month: int = Query(...),
    window_months: int = 6,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
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
                Transaction.user_id == current_user.id,
                Transaction.occurred_on >= window_start,
                Transaction.occurred_on < window_end,
            )
            .group_by(Transaction.rubro, Transaction.kind)
            .all()
        )

        lines = []
        for rubro, kind, total in rows:
            total_val = float(total or 0.0)
            suggested_monthly = (
                total_val / float(window_months) if window_months > 0 else total_val
            )
            lines.append(
                {
                    "rubro": rubro or "Sin rubro",
                    "kind": kind,
                    "suggested": suggested_monthly,
                    "monthly": suggested_monthly,
                    "annual": suggested_monthly * 12.0,
                }
            )

        return {
            "period": f"{year:04d}-{month:02d}",
            "window_months": window_months,
            "from": window_start.isoformat(),
            "to_exclusive": window_end.isoformat(),
            "lines": lines,
        }
    finally:
        db.close()


# ==========================
# Transacciones manuales
# ==========================

@app.post("/transactions/manual")
def create_manual_transaction(
    payload: ManualTransactionIn,
    current_user: User = Depends(get_current_user),
):
    db = SessionLocal()
    try:
        total = payload.total.quantize(Decimal("0.01"))
        iva = (total * Decimal("0.22")).quantize(Decimal("0.01"))
        neto = (total - iva).quantize(Decimal("0.01"))

        trx = Transaction(
            user_id=current_user.id,
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

        return {
            "id": trx.id,
            "message": "Transacción manual registrada correctamente",
        }
    finally:
        db.close()


# ==========================
# Importación CSV
# ==========================

@app.post("/transactions/import-csv")
async def import_transactions_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
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
    try:
        # Rama A: formato fila a fila
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
                    user_id=current_user.id,
                    kind=kind,
                    occurred_on=occurred_on,
                    rubro=rubro,
                    neto=neto,
                    iva=iva,
                    total=total,
                    description=description[:240],
                    document_id="import-csv",
                )
                db.add(trx)
                imported += 1

            db.commit()
            return {
                "imported": imported,
                "skipped": skipped,
                "message": f"Importadas {imported} filas (formato detallado), saltadas {skipped}.",
            }

        # Rama B: formato mensual
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
                    year_val = int(raw_year)
                else:
                    year_val = current_year

                if month_num == 12:
                    next_month_first = dt.date(year_val + 1, 1, 1)
                else:
                    next_month_first = dt.date(year_val, month_num + 1, 1)
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
                        user_id=current_user.id,
                        kind=kind,
                        occurred_on=occurred_on,
                        rubro=rubro,
                        neto=neto,
                        iva=iva,
                        total=total,
                        description=description[:240],
                        document_id="import-csv",
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
    finally:
        db.close()

