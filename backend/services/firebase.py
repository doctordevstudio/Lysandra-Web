"""
Thin async wrapper around Firebase RTDB REST API using /.json endpoints.
No SDK, no credentials file — just HTTP. Works great on Render free tier.

We deliberately use a single shared httpx.AsyncClient (connection pooling)
to keep latency low under concurrent load.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

from config import settings

log = logging.getLogger("lysandra.firebase")


class FirebaseRTDB:
    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = asyncio.Lock()

    async def client(self) -> httpx.AsyncClient:
        """Lazy-init a shared client (safe across event loops)."""
        if self._client is None or self._client.is_closed:
            async with self._lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        base_url=settings.FIREBASE_RTDB_URL,
                        timeout=httpx.Timeout(10.0, connect=5.0),
                        limits=httpx.Limits(
                            max_connections=50, max_keepalive_connections=20
                        ),
                    )
        return self._client

    # ---- low-level helpers ------------------------------------------------
    def _url(self, path: str) -> str:
        path = path.strip("/")
        url = f"/{path}.json" if path else "/.json"
        if settings.FIREBASE_DB_SECRET:
            url += f"?auth={settings.FIREBASE_DB_SECRET}"
        return url

    async def get(self, path: str) -> Any:
        c = await self.client()
        r = await c.get(self._url(path))
        r.raise_for_status()
        return r.json()

    async def set(self, path: str, value: Any) -> Any:
        c = await self.client()
        r = await c.put(self._url(path), json=value)
        r.raise_for_status()
        return r.json()

    async def update(self, path: str, value: dict) -> Any:
        c = await self.client()
        r = await c.patch(self._url(path), json=value)
        r.raise_for_status()
        return r.json()

    async def push(self, path: str, value: Any) -> str:
        """Append a child with an auto-generated key. Returns the new key."""
        c = await self.client()
        r = await c.post(self._url(path), json=value)
        r.raise_for_status()
        return r.json().get("name", "")

    async def delete(self, path: str) -> None:
        c = await self.client()
        r = await c.delete(self._url(path))
        r.raise_for_status()

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


db = FirebaseRTDB()
