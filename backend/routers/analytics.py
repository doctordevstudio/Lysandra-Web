"""
Server-side analytics for:
- unique carousel / dialog / page clicks (one per session_id)
- movie watch events (today / yesterday / all-time)
- unique page views (today / yesterday / all-time)

Firebase structure:
  analytics/clicks/{kind}/{ref_id}/{session_id} = timestamp
  analytics/views/{slug}/{yyyy-mm-dd}/{session_id} = timestamp
  analytics/watch/{yyyy-mm-dd}/{session_id}/{kinopoisk_id} = timestamp
  admin/visits/{ts}-{session8} = { ts, ip, path, ua, session_id }
"""
from __future__ import annotations

import time
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Request

from models.schemas import ClickEvent, WatchEvent
from services.firebase import db
from services.ratelimit import public_limiter
from services.security import client_ip

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def _log_visit(request: Request, path: str, session_id: str) -> None:
    """
    Push a lightweight visit record into admin/visits.
    Keyed by timestamp so sorting is trivial.
    """
    ts = int(time.time())
    await db.set(
        f"admin/visits/{ts}-{session_id[:8]}",
        {
            "ts": ts,
            "ip": client_ip(request),
            "path": path,
            "ua": request.headers.get("user-agent", "")[:180],
            "session_id": session_id,
        },
    )


@router.post("/click")
async def track_click(ev: ClickEvent, request: Request):
    ip = client_ip(request)
    ok, retry = public_limiter.check(ip)
    if not ok:
        return {"ok": False, "retry_after": retry}

    path = f"analytics/clicks/{ev.kind}/{ev.ref_id}/{ev.session_id}"
    existing = await db.get(path)
    if not existing:
        await db.set(path, int(time.time()))
        # Bump the per-item total for admin display
        if ev.kind == "carousel":
            current = await db.get(f"carousel/{ev.ref_id}/clicks") or 0
            await db.set(f"carousel/{ev.ref_id}/clicks", int(current) + 1)
        elif ev.kind == "dialog":
            current = await db.get(f"dialogs/{ev.ref_id}/total_views") or 0
            await db.set(f"dialogs/{ev.ref_id}/total_views", int(current) + 1)
    return {"ok": True}


@router.post("/watch")
async def track_watch(ev: WatchEvent, request: Request):
    ip = client_ip(request)
    ok, _ = public_limiter.check(ip)
    if not ok:
        return {"ok": False}

    day = _today()
    path = f"analytics/watch/{day}/{ev.session_id}/{ev.kinopoisk_id}"
    await db.set(
        path,
        {"t": int(time.time()), "title": ev.title, "source": ev.source},
    )
    return {"ok": True}


@router.post("/pageview/{slug}")
async def track_pageview(slug: str, request: Request):
    ip = client_ip(request)
    ok, _ = public_limiter.check(ip)

    body = await request.json() if request.headers.get("content-type") else {}
    session_id = (body or {}).get("session_id") or f"anon-{ip}"
    day = _today()
    path = f"analytics/views/{slug}/{day}/{session_id}"
    existing = await db.get(path)
    if not existing:
        await db.set(path, int(time.time()))
    # Always log the visit for admin (dedup happens in admin display if needed)
    await _log_visit(request, f"/page/{slug}", session_id)
    return {"ok": True}