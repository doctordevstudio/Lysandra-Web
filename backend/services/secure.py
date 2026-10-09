"""
Encrypted API traffic in BOTH directions (stateless, safe across gunicorn workers).

There is no key in the website's code. Per page load the browser creates an ephemeral, NON-extractable
ECDH P-256 key pair; its public half goes to the server in X-Client-Key. The server's long-term key is
derived (HKDF) from the APP_SECRET environment variable, which never leaves the server.
  shared secret --HKDF--> two AES-256-GCM keys:  server->client ("lysandra-v1")  client->server ("lysandra-v1-c2s")
Envelope: {"v":1,"iv":b64url,"ct":b64url}; ct = ciphertext||GCM tag; AAD = request path.
The GCM tag is the integrity hash: any change makes decryption fail. Requests also carry a timestamp
(checked against server time) so captured requests can't be replayed later.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import time
from collections import OrderedDict

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from config import settings

log = logging.getLogger("lysandra.secure")
_INFO_S2C = b"lysandra-v1"
_INFO_C2S = b"lysandra-v1-c2s"
_P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
REQUEST_MAX_AGE_MS = 5 * 60 * 1000


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
_keys: "OrderedDict[str, tuple[bytes, bytes]]" = OrderedDict()


def _derive(client_b64: str) -> tuple[bytes, bytes]:
    """Returns (server->client key, client->server key)."""
    k = _keys.get(client_b64)
    if k:
        _keys.move_to_end(client_b64)
        return k
    raw = b64u_dec(client_b64)
    if len(raw) != 65 or raw[0] != 4:
        raise ValueError("bad key")
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
    shared = _SERVER.exchange(ec.ECDH(), pub)
    k = (
        HKDF(hashes.SHA256(), 32, None, _INFO_S2C).derive(shared),
        HKDF(hashes.SHA256(), 32, None, _INFO_C2S).derive(shared),
    )
    _keys[client_b64] = k
    if len(_keys) > 2048:
        _keys.popitem(last=False)
    return k


def encrypt_for(client_b64: str, data, aad: str) -> dict:
    key = _derive(client_b64)[0]
    iv = os.urandom(12)
    pt = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    return {"v": 1, "iv": b64u(iv), "ct": b64u(AESGCM(key).encrypt(iv, pt, aad.encode()))}


def decrypt_from(client_b64: str, env: dict, aad: str):
    key = _derive(client_b64)[1]
    pt = AESGCM(key).decrypt(b64u_dec(env["iv"]), b64u_dec(env["ct"]), aad.encode())
    return json.loads(pt)


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


async def open_body(request: Request) -> dict:
    """Read a JSON request body, decrypting it when encryption is on."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid body")
    if not settings.ENCRYPT_API:
        return body if isinstance(body, dict) else {}
    hdr = request.headers.get("x-client-key", "")
    if not hdr or not isinstance(body, dict) or "ct" not in body or "iv" not in body:
        raise HTTPException(400, "Secure channel required")
    try:
        plain = decrypt_from(hdr, body, request.url.path)
    except Exception:
        raise HTTPException(400, "Bad payload")
    t = plain.get("t") if isinstance(plain, dict) else None
    if not isinstance(t, (int, float)) or abs(time.time() * 1000 - t) > REQUEST_MAX_AGE_MS:
        raise HTTPException(400, "Stale request")
    return plain
