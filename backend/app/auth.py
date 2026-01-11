from fastapi import APIRouter, HTTPException, Depends, status, Query
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from jose import jwt, JWTError
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import os

from .db import SessionLocal, User

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY no configurada")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


def get_password_hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(plain_password: str, password_hash: str) -> bool:
    return get_password_hash(plain_password) == password_hash


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Extrae el usuario actual a partir del JWT enviado en Authorization: Bearer <token>.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None or not user.is_active:
            raise credentials_exception
        return user
    finally:
        db.close()


def get_current_user_flexible(
    token: str = Depends(oauth2_scheme),
    access_token: Optional[str] = Query(default=None),
) -> User:
    """
    Permite autenticar por header (Authorization: Bearer) o por query (?access_token=...).
    PARCHE TEMPORAL para requests del frontend que salen sin Authorization.
    """
    if access_token:
        token = access_token
    # llamamos a la validación normal
    return jwt_user_from_token(token)


def jwt_user_from_token(token: str) -> User:
    """
    Helper para reutilizar la lógica de get_current_user sin Depends.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None or not user.is_active:
            raise credentials_exception
        return user
    finally:
        db.close()


@router.post("/register")
def register(user: UserCreate):
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == user.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="El usuario ya existe")

        db_user = User(email=user.email, password_hash=get_password_hash(user.password))
        db.add(db_user)
        db.commit()
        return {"message": "Usuario registrado correctamente"}
    finally:
        db.close()


@router.post("/login")
def login(user: UserLogin):
    db = SessionLocal()
    try:
        db_user = db.query(User).filter(User.email == user.email).first()
        if not db_user or not verify_password(user.password, db_user.password_hash):
            raise HTTPException(status_code=400, detail="Credenciales inválidas")

        if not db_user.is_active:
            raise HTTPException(status_code=400, detail="Usuario inactivo")

        access_token = create_access_token({"sub": db_user.email})
        return {"access_token": access_token, "token_type": "bearer"}
    finally:
        db.close()

