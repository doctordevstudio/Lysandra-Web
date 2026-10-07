"""Tiny per-process TTL cache (public lists change rarely; saves Firebase round-trips)."""
from __future__ import annotations

import time
from typing import Any


class TTLCache:
    def __init__(self) -> None:
        self._d: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any:
        hit = self._d.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
        self._d.pop(key, None)
        return None

    def set(self, key: str, value: Any, ttl: float = 20.0) -> Any:
        if len(self._d) > 500:
            now = time.time()
            self._d = {k: v for k, v in self._d.items() if v[0] > now}
        self._d[key] = (time.time() + ttl, value)
        return value

    def drop(self, prefix: str = "") -> None:
        for k in [k for k in self._d if k.startswith(prefix)]:
            self._d.pop(k, None)


cache = TTLCache()
