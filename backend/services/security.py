"""
Auth + device fingerprinting utilities.
- Plaintext password comparison (no hashing)
- JWT issue/verify with optional no-expiry mode
- Deterministic device fingerprint from request headers
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Request
from jose import JWTError, jwt

from config import settings


def verify_password(plain: str, expected: str) -> bool:
    """
    Constant-time comparison to avoid timing attacks.
    Both args are plaintext now.
    """
    if not expected:
        return False
    return hmac.compare_digest(plain, expected)


def create_admin_token(username: str) -> str:
    """
    Issue a JWT. If JWT_TTL_MIN == 0, no 'exp' claim is added
    (token never expires).
    """
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": username,
        "iat": int(now.timestamp()),
        "role": "admin",
    }
    if settings.JWT_TTL_MIN > 0:
        payload["exp"] = int(
            (now + timedelta(minutes=settings.JWT_TTL_MIN)).timestamp()
        )
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_admin_token(token: str) -> dict[str, Any] | None:
    """
    Decode a JWT. python-jose automatically verifies 'exp' if present.
    If no 'exp' claim, token is accepted indefinitely.
    """
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALG],
            options={"verify_exp": True},  # ignored if no exp claim
        )
    except JWTError:
        return None


def client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


def device_fingerprint(request: Request) -> str:
    parts = [
        client_ip(request),
        request.headers.get("user-agent", ""),
        request.headers.get("accept-language", ""),
        request.headers.get("sec-ch-ua-platform", ""),
    ]
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
