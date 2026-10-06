"""
In-memory sliding-window rate limiter, keyed by client IP.
Works fine on a single Render instance. If you scale to multiple
instances, swap this for Upstash Redis — interface stays the same.
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

    def check(self, key: str) -> tuple[bool, int]:
        """
        Returns (allowed, retry_after_seconds).
        If not allowed, retry_after tells the client when to try again.
        """
        now = time.time()
        with self._lock:
            until = self._blocked_until.get(key, 0)
            if until > now:
                return False, int(until - now)

            dq = self._hits[key]
            # drop old hits
            cutoff = now - self.window
            while dq and dq[0] < cutoff:
                dq.popleft()

            if len(dq) >= self.limit:
                self._blocked_until[key] = now + self.block_sec
                return False, self.block_sec

            dq.append(now)
            return True, 0

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)
            self._blocked_until.pop(key, None)


public_limiter = SlidingWindow(
    limit=settings.PUBLIC_RPM,
    window_sec=60,
    block_sec=settings.PUBLIC_BLOCK_MIN * 60,
)

admin_limiter = SlidingWindow(
    limit=10,           # 10 login attempts / min
    window_sec=60,
    block_sec=settings.ADMIN_BLOCK_MIN * 60,
)