@echo on
cd /d C:\AltiumFinanzas2-no-docker

call .venv\Scripts\activate

python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
