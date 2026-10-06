"""
Auth + device fingerprinting utilities.
- bcrypt password hashing
- JWT issue/verify for admin sessions
- deterministic device fingerprint from request headers
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Request
from jose import JWTError, jwt
from passlib.context import CryptContext

from config import settings

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


def create_admin_token(username: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.JWT_TTL_MIN)).timestamp()),
        "role": "admin",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_admin_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError:
        return None


def client_ip(request: Request) -> str:
    # Render puts the real IP in X-Forwarded-For
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def device_fingerprint(request: Request) -> str:
    """
    Stable per-device hash. Changes if UA or Accept-Language changes,
    which is fine for blocking purposes.
    """
    parts = [
        client_ip(request),
        request.headers.get("user-agent", ""),
        request.headers.get("accept-language", ""),
        request.headers.get("sec-ch-ua-platform", ""),
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()