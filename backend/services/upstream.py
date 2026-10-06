"""
Async proxy to the upstream catalog API. Keeps the real origin hidden
from the browser and lets us add caching / rate-limiting centrally.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

from config import settings

log = logging.getLogger("lysandra.upstream")


class Upstream:
    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = asyncio.Lock()
        # tiny in-process cache: {cache_key: (expiry_ts, payload)}
        self._cache: dict[str, tuple[float, Any]] = {}
        self._ttl = 60.0  # seconds

    async def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        base_url=settings.UPSTREAM_BASE,
                        timeout=httpx.Timeout(15.0, connect=5.0),
                        headers={
                            "User-Agent": settings.UPSTREAM_UA,
                            "Accept-Encoding": "gzip",
                        },
                        limits=httpx.Limits(
                            max_connections=100, max_keepalive_connections=30
                        ),
                    )
        return self._client

    async def fetch(
        self, path: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """
        GET {UPSTREAM_BASE}/{path} with caching.
        path examples: 'bollywood', 'hollywood', 'serials'
        """
        import time

        params = params or {}
        key = f"{path}?{sorted(params.items())}"
        now = time.time()
        hit = self._cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

        c = await self.client()
        r = await c.get(f"/{path}", params=params)
        r.raise_for_status()
        data = r.json()
        self._cache[key] = (now + self._ttl, data)
        return data

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


upstream = Upstream()