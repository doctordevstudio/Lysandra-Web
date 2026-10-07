"""
Per-day counters in Firebase:  counters/{metric}/{key}/{YYYY-MM-DD} = int
Metrics: new_users, active, old_active, watch (key 'all'), page_view (slug),
         click_carousel (id), view_dialog (id).
Increments are atomic (server-side). Totals are the sum of the day buckets.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from config import settings
from services.firebase import db

ALL = "all"


def local_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=settings.STATS_UTC_OFFSET_MIN)


def today() -> str:
    return local_now().strftime("%Y-%m-%d")


def yesterday() -> str:
    return (local_now() - timedelta(days=1)).strftime("%Y-%m-%d")


async def bump(metric: str, key: str = ALL, day: str | None = None) -> None:
    await db.incr(f"counters/{metric}/{key}/{day or today()}")


async def series(metric: str, key: str = ALL) -> dict[str, int]:
    data = await db.get(f"counters/{metric}/{key}")
    return {k: int(v) for k, v in data.items()} if isinstance(data, dict) else {}


async def all_series(metric: str) -> dict[str, dict[str, int]]:
    data = await db.get(f"counters/{metric}")
    out: dict[str, dict[str, int]] = {}
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, dict):
                out[k] = {d: int(n) for d, n in v.items()}
    return out


def parse_day(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def in_range(s: dict[str, int], start: str, end: str) -> int:
    d0, d1 = parse_day(start), parse_day(end)
    if d1 < d0:
        d0, d1 = d1, d0
    if (d1 - d0).days > 731:
        raise ValueError("range too large")
    return sum(n for k, n in s.items() if d0 <= parse_day(k) <= d1)


def summary(s: dict[str, int]) -> dict[str, int]:
    return {"today": s.get(today(), 0), "yesterday": s.get(yesterday(), 0), "all": sum(s.values())}
