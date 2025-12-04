# backend/app/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .auth import router as auth_router
from .db import init_db, SessionLocal, Document, Transaction


import os, hashlib, re, csv
from datetime import datetime, timedelta
import datetime as dt
from decimal import Decimal
from typing import Optional, Literal
from sqlalchemy import func

# OCR / imágenes / PDF
import pytesseract
from PIL import Image, ImageOps, ImageFilter
from io import BytesIO, StringIO
import fitz  # PyMuPDF

import platform

# Solo forzamos la ruta en Windows; en Linux (Render) usará la que viene del sistema
if platform.system() == "Windows":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


# --------- Helpers OCR ----------
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

        # binarización simple heurística
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
    parts = []
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


# --------- Helpers parsing contable ----------
def extract_date(text: str) -> str:
    m = re.search(
        r"(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})", text
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
    """Devuelve (iva, neto, total). Si no detecta IVA explícito, asume 22% (UY)."""
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


# --------- App / Config ----------
STORAGE_PATH = os.path.join(os.path.dirname(__file__), "..", "storage")
os.makedirs(STORAGE_PATH, exist_ok=True)

app = FastAPI(title="Altium Finanzas API (Local)")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # 👈 permitir cualquier origen (solo dev)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/auth")


@app.on_event("startup")
def startup():
    init_db()


# --------- Modelos de respuesta / entrada ----------
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
    if not file.filename:
        raise HTTPException(400, "Archivo inválido")

    data = await file.read()
    checksum = hashlib.sha256(data).hexdigest()
    path = os.path.join(STORAGE_PATH, f"{checksum}-{file.filename}")

    # Guardar archivo
    with open(path, "wb") as f:
        f.write(data)

    # OCR según tipo
    filename = (file.filename or "").lower()
    mime = (file.content_type or "").lower()
    if filename.endswith(".pdf") or "pdf" in mime:
        ocr_text = ocr_pdf_bytes(data)
    else:
        ocr_text = ocr_image_bytes(data)

    # Persistir documento
    db = SessionLocal()
    doc = Document(
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

    # ---- Parsing contable y guardar transacción ----
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

    # Preview para la UI
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
    return {"document_id": str(doc.id), "ocr_preview": preview, "parsed": parsed}


@app.get("/analytics/income-statement")
def income_statement(year: int = Query(...), month: int = Query(...)):
    """
    Devuelve EERR del mes (ingresos, gastos, margen) + comparativo vs mes anterior
    y detalle por rubro/kind.
    """
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
    """
    Sugiere un presupuesto por rubro/tipo usando el promedio de los últimos N meses (default 6).

    - 'monthly': promedio mensual sugerido
    - 'annual': monthly * 12

    Ejemplo: year=2025, month=11 => usa datos de mayo a octubre de 2025.
    """
    db = SessionLocal()

    # primer día del mes destino
    target_first = datetime(year, month, 1)

    # calcular el primer día del mes de inicio de la ventana (6 meses antes)
    y = year
    m = month
    for _ in range(window_months):
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    window_start = datetime(y, m, 1).date()  # ej: 2025-05-01
    window_end = target_first.date()         # excluyente: 2025-11-01

    # Agregado por rubro + kind en la ventana
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
        suggested_monthly = (
            total_val / float(window_months) if window_months > 0 else total_val
        )
        lines.append(
            {
                "rubro": rubro or "Sin rubro",
                "kind": kind,
                "suggested": suggested_monthly,      # compatibilidad hacia atrás
                "monthly": suggested_monthly,        # monto mensual
                "annual": suggested_monthly * 12.0,  # monto anual
            }
        )

    return {
        "period": f"{year:04d}-{month:02d}",
        "window_months": window_months,
        "from": window_start.isoformat(),
        "to_exclusive": window_end.isoformat(),
        "lines": lines,
    }



@app.post("/transactions/manual")
def create_manual_transaction(payload: ManualTransactionIn):
    """
    Carga manual de ingresos/egresos cuando no hay comprobante
    o cuando el usuario quiere agregar un movimiento a mano.
    """
    db = SessionLocal()

    total = payload.total.quantize(Decimal("0.01"))
    # Usamos la misma lógica que en el resto del sistema: IVA 22%
    iva = (total * Decimal("0.22")).quantize(Decimal("0.01"))
    neto = (total - iva).quantize(Decimal("0.01"))

    trx = Transaction(
        kind=payload.kind,  # "income" o "expense"
        occurred_on=payload.date,
        rubro=payload.rubro,
        neto=neto,
        iva=iva,
        total=total,
        description=payload.description or "Carga manual",
        document_id="manual",  # marca que no viene de un documento OCR
    )
    db.add(trx)
    db.commit()
    db.refresh(trx)

    return {
        "id": trx.id,
        "message": "Transacción manual registrada correctamente",
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
    # decodificar texto y detectar delimitador (coma o punto y coma)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    # detectar delimitador con Sniffer
    try:
        sample = "\n".join(text.splitlines()[:5]) or text
        dialect = csv.Sniffer().sniff(sample)
    except Exception:
        dialect = csv.excel  # default coma

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
                # Fecha
                raw_date = (row.get("date") or "").strip()
                if not raw_date:
                    raise ValueError("Fecha vacía")

                if "-" in raw_date:
                    # asumimos YYYY-MM-DD
                    occurred_on = dt.datetime.strptime(raw_date, "%Y-%m-%d").date()
                elif "/" in raw_date:
                    # intentamos DD/MM/YYYY
                    occurred_on = dt.datetime.strptime(raw_date, "%d/%m/%Y").date()
                else:
                    occurred_on = dt.datetime.fromisoformat(raw_date).date()

                # kind
                kind = (row.get("kind") or "").strip().lower()
                if kind not in ("income", "expense"):
                    raise ValueError("kind inválido")

                # rubro
                rubro = (row.get("rubro") or "").strip() or "Sin rubro"

                # descripción
                description = (row.get("description") or "").strip() or "Importado CSV"

                # total
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

    # -------- Rama B: formato mensual por columnas (mes, ventas, compras, ...) --------
    if "mes" not in headers:
        raise HTTPException(
            400,
            "El CSV no tiene formato reconocido. Se espera 'date,kind,rubro,total' "
            "o bien 'mes, ventas, compras, ...'.",
        )

    # mapeo de nombre de mes en español a número
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

    # columnas a ignorar como rubros
    ignore_cols = {"mes", "año", "anio", ""}

    for row in reader:
        try:
            raw_mes = (row.get("mes") or "").strip()
            if not raw_mes:
                raise ValueError("Mes vacío")

            month_num = parse_month(raw_mes)

            # permitir columna opcional de año
            raw_year = (row.get("año") or row.get("anio") or "").strip()
            if raw_year.isdigit():
                year = int(raw_year)
            else:
                year = current_year  # si no hay año, usamos el año actual

            # último día del mes
            if month_num == 12:
                next_month_first = dt.date(year + 1, 1, 1)
            else:
                next_month_first = dt.date(year, month_num + 1, 1)
            occurred_on = next_month_first - dt.timedelta(days=1)

            # recorrer todas las columnas excepto mes/año y vacías
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
                    # valor no numérico, lo salteamos
                    continue

                if total == 0:
                    continue

                total = total.quantize(Decimal("0.01"))
                iva = (total * Decimal("0.22")).quantize(Decimal("0.01"))
                neto = (total - iva).quantize(Decimal("0.01"))

                # determinar si es ingreso o gasto
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
