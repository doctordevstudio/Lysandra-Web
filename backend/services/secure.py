"""
Encrypted API responses (stateless, safe across gunicorn workers).

Browser: ephemeral ECDH P-256 key pair per page load; sends its public key in X-Client-Key.
Server : static ECDH key (derived from APP_SECRET); shared secret -> HKDF-SHA256 -> AES-256-GCM key.
Every response body is {"v":1,"iv":..,"ct":..}; ct = ciphertext||GCM tag, AAD = request path.
GCM's tag is the integrity hash: any tampering makes decryption fail in the browser.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from collections import OrderedDict

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from config import settings

log = logging.getLogger("lysandra.secure")
_INFO = b"lysandra-v1"
_P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def b64u_dec(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _make_server_key() -> ec.EllipticCurvePrivateKey:
    seed = settings.APP_SECRET or (settings.FIREBASE_DB_SECRET + settings.FIREBASE_RTDB_URL)
    if not seed:
        seed = "lysandra-dev-only"
        log.warning("APP_SECRET not set: using an insecure development key")
    elif not settings.APP_SECRET:
        log.warning("APP_SECRET not set: deriving key from Firebase settings. Set APP_SECRET.")
    raw = HKDF(hashes.SHA256(), 32, None, b"lysandra-ecdh-seed").derive(seed.encode())
    n = int.from_bytes(raw, "big") % (_P256_ORDER - 1) + 1
    return ec.derive_private_key(n, ec.SECP256R1())


_SERVER = _make_server_key()
SERVER_PUB = b64u(
    _SERVER.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
)
_keys: "OrderedDict[str, bytes]" = OrderedDict()


def _derive(client_b64: str) -> bytes:
    k = _keys.get(client_b64)
    if k:
        _keys.move_to_end(client_b64)
        return k
    raw = b64u_dec(client_b64)
    if len(raw) != 65 or raw[0] != 4:
        raise ValueError("bad key")
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
    shared = _SERVER.exchange(ec.ECDH(), pub)
    k = HKDF(hashes.SHA256(), 32, None, _INFO).derive(shared)
    _keys[client_b64] = k
    if len(_keys) > 2048:
        _keys.popitem(last=False)
    return k


def encrypt_for(client_b64: str, data, aad: str) -> dict:
    key = _derive(client_b64)
    iv = os.urandom(12)
    pt = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    ct = AESGCM(key).encrypt(iv, pt, aad.encode())
    return {"v": 1, "iv": b64u(iv), "ct": b64u(ct)}


def seal(request: Request, data) -> JSONResponse:
    """Encrypt `data` for the caller (or plain JSON when ENCRYPT_API=0)."""
    if not settings.ENCRYPT_API:
        return JSONResponse(data, headers={"Cache-Control": "no-store"})
    hdr = request.headers.get("x-client-key", "")
    if not hdr:
        raise HTTPException(400, "Secure channel required")
    try:
        env = encrypt_for(hdr, data, request.url.path)
    except Exception:
        raise HTTPException(400, "Bad client key")
    return JSONResponse(env, headers={"X-Enc": "1", "Cache-Control": "no-store"})
