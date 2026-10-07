"""Async proxy to the upstream catalog API (hides the origin; primary + fallback; small cache)."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

import httpx

from config import settings

log = logging.getLogger("lysandra.upstream")


class UpstreamError(RuntimeError):
    pass


class Upstream:
    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = asyncio.Lock()
        self._cache: dict[str, tuple[float, Any]] = {}
        self._ttl = 60.0

    async def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        timeout=httpx.Timeout(15.0, connect=5.0),
                        headers={"User-Agent": settings.UPSTREAM_UA, "Accept": "application/json"},
                        limits=httpx.Limits(max_connections=100, max_keepalive_connections=30),
                        follow_redirects=True,
                    )
        return self._client

    async def fetch(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        params = params or {}
        key = f"{path}?{sorted(params.items())}"
        now = time.time()
        hit = self._cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

        c = await self.client()
        bases = [b for b in (settings.UPSTREAM_BASE, settings.UPSTREAM_FALLBACK) if b]
        last = "no upstream configured"
        for base in dict.fromkeys(bases):
            try:
                r = await c.get(f"{base}/{path}", params=params)
                r.raise_for_status()
                data = r.json()
                if len(self._cache) > 400:
                    self._cache = {k: v for k, v in self._cache.items() if v[0] > now}
                self._cache[key] = (now + self._ttl, data)
                return data
            except Exception as e:  # try the next base
                last = f"{type(e).__name__}"
                log.warning("upstream %s failed: %s", base, e)
        raise UpstreamError(last)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()


upstream = Upstream()
