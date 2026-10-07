"""Auth helpers: credential check, session tokens, client IP, device ids."""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import secrets

from fastapi import Request

from config import settings


def _b(s: str) -> bytes:
    return (s or "").encode("utf-8")


def verify_credentials(username: str, password: str) -> bool:
    """Constant-time. Both checks always run so timing doesn't reveal which was wrong."""
    user_ok = hmac.compare_digest(_b(username), _b(settings.ADMIN_USERNAME))
    pass_ok = False
    if settings.ADMIN_PASSWORD_HASH:
        try:
            import bcrypt
            pass_ok = bcrypt.checkpw(_b(password), _b(settings.ADMIN_PASSWORD_HASH))
        except Exception:
            pass_ok = False
    elif settings.ADMIN_PASSWORD:
        pass_ok = hmac.compare_digest(_b(password), _b(settings.ADMIN_PASSWORD))
    return bool(user_ok and pass_ok)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_id(token: str) -> str:
    """Only the SHA-256 of a session token is stored, so a DB leak can't hijack sessions."""
    return hashlib.sha256(_b(token)).hexdigest()


def hash_key(s: str) -> str:
    return hashlib.sha256(_b(s)).hexdigest()[:32]


def client_ip(request: Request) -> str:
    """
    Prefer headers set by Cloudflare/Render's edge (not client-forgeable at the edge),
    then X-Forwarded-For, then the socket peer.
    """
    for h in ("cf-connecting-ip", "true-client-ip"):
        v = request.headers.get(h, "").strip()
        if v:
            try:
                return str(ipaddress.ip_address(v))
            except ValueError:
                pass
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        v = xff.split(",")[0].strip()
        try:
            return str(ipaddress.ip_address(v))
        except ValueError:
            pass
    return request.client.host if request.client else "0.0.0.0"


def device_ids(request: Request, client_fp: str = "") -> tuple[str, str]:
    """(ip_id, device_id): both are safe Firebase keys. Blocks apply to either."""
    ip_id = "ip_" + hash_key(client_ip(request))
    ua = request.headers.get("user-agent", "")
    lang = request.headers.get("accept-language", "")
    seed = client_fp if client_fp else f"{ua}|{lang}"
    return ip_id, "dv_" + hash_key(f"{seed}|{ua}")
