from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from jose import jwt
from datetime import datetime, timedelta
from typing import Optional
import hashlib

router = APIRouter()

SECRET_KEY = "CAMBIA_ESTE_SECRETO"  # poné algo más largo después si querés
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# "Base de datos" en memoria
fake_users_db: dict[str, dict] = {}

def get_password_hash(password: str) -> str:
    # Hash simple con SHA256 (para demo; no es ideal para producción)
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_password(plain_password: str, password_hash: str) -> bool:
    return get_password_hash(plain_password) == password_hash

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/register")
def register(user: UserCreate):
    if user.email in fake_users_db:
        raise HTTPException(status_code=400, detail="El usuario ya existe")

    fake_users_db[user.email] = {
        "email": user.email,
        "password_hash": get_password_hash(user.password),
    }
    return {"message": "Usuario registrado correctamente"}

@router.post("/login")
def login(user: UserLogin):
    db_user = fake_users_db.get(user.email)
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Credenciales inválidas")

    access_token = create_access_token({"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}
