# Altium Finanzas 2.0 (Sin Docker) - Guía rápida

## Requisitos
- Python 3.10+
- Node.js 18+
- **Tesseract OCR** instalado en tu sistema.
  - Windows: instalador de Tesseract (luego reiniciar la PC o la terminal).
  - macOS: `brew install tesseract`
  - Linux (Debian/Ubuntu): `sudo apt-get install tesseract-ocr`

## Backend (FastAPI + SQLite)
1. Abrí una terminal en esta carpeta.
2. Windows: `run.bat` | macOS/Linux: `bash run.sh`
3. Esto crea un entorno virtual, instala dependencias y levanta FastAPI en `http://127.0.0.1:8000`.

## Frontend (Next.js)
1. Abrí otra terminal y `cd web`
2. `npm install`
3. `npm run dev`
4. Abrí `http://localhost:3000`

## Probar
- Subí una imagen (foto de ticket/factura) y verás un id y un resumen de OCR.
- Los archivos se guardan en `backend/storage/` y la base en `backend/db.sqlite`.
