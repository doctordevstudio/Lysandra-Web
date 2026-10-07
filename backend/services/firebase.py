"""
Async wrapper around the Firebase RTDB REST API.

Security: every path segment is validated (letters, digits, _ and -). Client-supplied
ids can therefore never contain "/", ".." or RTDB-forbidden characters, which closes
path-injection into other parts of the database (e.g. admin/sessions).
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Optional

import httpx

from config import settings

log = logging.getLogger("lysandra.firebase")

_SEG = re.compile(r"^[A-Za-z0-9_\-]{1,128}$")


class BadKey(ValueError):
    """A path segment contained characters we never allow."""


class DBError(RuntimeError):
    """Firebase unreachable / returned an error."""


def clean_path(path: str) -> str:
    segs = [s for s in path.strip("/").split("/") if s]
    for s in segs:
        if not _SEG.match(s):
            raise BadKey(f"invalid key segment: {s[:40]!r}")
    return "/".join(segs)


class FirebaseRTDB:
    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = asyncio.Lock()

    async def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._lock:
                if self._client is None or self._client.is_closed:
                    if not settings.FIREBASE_RTDB_URL:
                        raise DBError("FIREBASE_RTDB_URL is not set")
                    self._client = httpx.AsyncClient(
                        base_url=settings.FIREBASE_RTDB_URL,
                        timeout=httpx.Timeout(10.0, connect=5.0),
                        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
                    )
        return self._client

    @staticmethod
    def _url(path: str) -> str:
        p = clean_path(path)
        return f"/{p}.json" if p else "/.json"

    @staticmethod
    def _params(extra: dict | None = None) -> dict:
        p = dict(extra or {})
        if settings.FIREBASE_DB_SECRET:
            p["auth"] = settings.FIREBASE_DB_SECRET
        return p

    async def _do(self, method: str, path: str, *, json: Any = None, params: dict | None = None):
        c = await self.client()
        url = self._url(path)
        last: Exception | None = None
        for attempt in (1, 2):  # one retry on transient network errors
            try:
                r = await c.request(method, url, json=json, params=self._params(params))
                if r.status_code >= 500 and attempt == 1:
                    await asyncio.sleep(0.2)
                    continue
                if r.status_code >= 400:
                    log.error("RTDB %s %s -> %s %s", method, path, r.status_code, r.text[:200])
                    raise DBError(f"database error {r.status_code}")
                return r.json() if r.content else None
            except httpx.TransportError as e:
                last = e
                await asyncio.sleep(0.2)
        raise DBError(f"database unreachable: {last}")

    # ---- public API -------------------------------------------------------
    async def get(self, path: str) -> Any:
        return await self._do("GET", path)

    async def get_last(self, path: str, n: int) -> dict:
        """Most recent N children by key (push keys are chronological)."""
        data = await self._do(
            "GET", path, params={"orderBy": '"$key"', "limitToLast": int(n)}
        )
        return data if isinstance(data, dict) else {}

    async def set(self, path: str, value: Any) -> Any:
        return await self._do("PUT", path, json=value)

    async def update(self, path: str, value: dict) -> Any:
        return await self._do("PATCH", path, json=value)

    async def push(self, path: str, value: Any) -> str:
        r = await self._do("POST", path, json=value)
        return (r or {}).get("name", "")

    async def delete(self, path: str) -> None:
        await self._do("DELETE", path)

    async def incr(self, path: str, n: int = 1) -> None:
        """Atomic server-side increment (no read-modify-write race)."""
        await self._do("PUT", path, json={".sv": {"increment": int(n)}})

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


db = FirebaseRTDB()
