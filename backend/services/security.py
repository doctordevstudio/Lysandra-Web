"""
Auth + device fingerprinting utilities.
- Plaintext password comparison (no hashing)
- Random session tokens stored in Firebase (no JWT)
- Deterministic device fingerprint from request headers
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from typing import Any

from fastapi import Request

from config import settings


def verify_password(plain: str, expected: str) -> bool:
    """
    Constant-time comparison. Both args are plaintext.
    """
    if not expected:
        return False
    return hmac.compare_digest(plain, expected)


def generate_session_token() -> str:
    """Cryptographically random URL-safe token (43 chars)."""
    return secrets.token_urlsafe(32)


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
