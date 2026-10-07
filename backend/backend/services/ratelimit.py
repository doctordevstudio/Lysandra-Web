"""
In-memory sliding-window limiter keyed by client id.
NOTE: state is per worker process. With 2 gunicorn workers the effective
ceiling is roughly 2x; use Redis if you need an exact global limit.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Deque

from config import settings


class SlidingWindow:
    def __init__(self, limit: int, window_sec: int, block_sec: int) -> None:
        self.limit = limit
        self.window = window_sec
        self.block_sec = block_sec
        self._hits: dict[str, Deque[float]] = defaultdict(deque)
        self._blocked_until: dict[str, float] = {}
        self._lock = Lock()
        self._n = 0

    def configure(self, limit: int, block_sec: int) -> None:
        self.limit, self.block_sec = max(1, int(limit)), max(1, int(block_sec))

    def _gc(self, now: float) -> None:
        for k in [k for k, dq in self._hits.items() if not dq or dq[-1] < now - self.window]:
            self._hits.pop(k, None)
        for k in [k for k, t in self._blocked_until.items() if t <= now]:
            self._blocked_until.pop(k, None)

    def check(self, key: str) -> tuple[bool, int]:
        """Returns (allowed, retry_after_seconds)."""
        now = time.time()
        with self._lock:
            self._n += 1
            if self._n % 500 == 0:
                self._gc(now)
            until = self._blocked_until.get(key, 0)
            if until > now:
                return False, int(until - now) + 1
            dq = self._hits[key]
            cutoff = now - self.window
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= self.limit:
                self._blocked_until[key] = now + self.block_sec
                dq.clear()
                return False, self.block_sec
            dq.append(now)
            return True, 0

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)
            self._blocked_until.pop(key, None)


public_limiter = SlidingWindow(settings.PUBLIC_RPM, 60, settings.PUBLIC_BLOCK_MIN * 60)
admin_limiter = SlidingWindow(10, 60, settings.ADMIN_BLOCK_MIN * 60)  # login attempts / min
