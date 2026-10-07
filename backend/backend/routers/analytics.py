"""
Public analytics (all unique-per-session, written in the background so requests return instantly).

  users/{sid}                          first_seen / first_day
  analytics/active/{day}/{sid}         marker: user active that day
  analytics/watch/{day}/{sid}/{id}     marker + title/source
  analytics/clicks/{kind}/{ref}/{sid}  marker: first click ever from that user
  analytics/views/{slug}/{day}/{sid}   marker: unique page view per day
  admin/visits                         "user website" log (one row per user per day)
"""
from __future__ import annotations

import logging
import time

from fastapi import APIRouter, BackgroundTasks, Request

from models.schemas import ClickEvent, PageviewEvent, VisitEvent, WatchEvent
from services import counters
from services.defaults import PAGE_SLUGS
from services.firebase import db
from services.security import client_ip, hash_key

log = logging.getLogger("lysandra.analytics")
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


async def _safe(coro) -> None:
    try:
        await coro
    except Exception as e:  # analytics must never break the site
        log.warning("analytics task failed: %s", e)


async def _record_visit(sid: str, ip: str, ua: str) -> None:
    day = counters.today()
    marker = f"analytics/active/{day}/{sid}"
    if await db.get(marker):
        return
    await db.set(marker, 1)
    user = await db.get(f"users/{sid}")
    if isinstance(user, dict) and user.get("first_day"):
        first_day = user["first_day"]
    else:
        first_day = day
        await db.set(f"users/{sid}", {"first_seen": int(time.time()), "first_day": day})
        await counters.bump("new_users")
    await counters.bump("active")
    if first_day < day:
        await counters.bump("old_active")
    await db.push("admin/visits", {
        "ts": int(time.time()), "ip": ip, "session_id": sid[:12], "ua": ua[:180],
        "path": "/", "new": first_day == day,
    })


async def _record_click(ev: ClickEvent) -> None:
    if ev.kind not in ("carousel", "dialog"):
        return
    marker = f"analytics/clicks/{ev.kind}/{ev.ref_id}/{ev.session_id}"
    if await db.get(marker):
        return
    root = "carousel" if ev.kind == "carousel" else "dialogs"
    if await db.get(f"{root}/{ev.ref_id}/enabled") is None:  # unknown id: ignore, don't pollute DB
        return
    await db.set(marker, int(time.time()))
    if ev.kind == "carousel":
        await counters.bump("click_carousel", ev.ref_id)
        await db.incr(f"carousel/{ev.ref_id}/clicks")
    else:
        await counters.bump("view_dialog", ev.ref_id)
        await db.incr(f"dialogs/{ev.ref_id}/total_views")


async def _record_watch(ev: WatchEvent) -> None:
    path = f"analytics/watch/{counters.today()}/{ev.session_id}/{ev.kinopoisk_id}"
    if await db.get(path):
        return
    await db.set(path, {"t": int(time.time()), "title": ev.title, "source": ev.source})
    await counters.bump("watch")


async def _record_pageview(slug: str, sid: str) -> None:
    path = f"analytics/views/{slug}/{counters.today()}/{sid}"
    if await db.get(path):
        return
    await db.set(path, int(time.time()))
    await counters.bump("page_view", slug)


@router.post("/visit")
async def visit(ev: VisitEvent, request: Request, bg: BackgroundTasks):
    bg.add_task(_safe, _record_visit(ev.session_id, client_ip(request), request.headers.get("user-agent", "")))
    return {"ok": True}


@router.post("/click")
async def track_click(ev: ClickEvent, bg: BackgroundTasks):
    bg.add_task(_safe, _record_click(ev))
    return {"ok": True}


@router.post("/watch")
async def track_watch(ev: WatchEvent, bg: BackgroundTasks):
    bg.add_task(_safe, _record_watch(ev))
    return {"ok": True}


@router.post("/pageview/{slug}")
async def track_pageview(slug: str, request: Request, bg: BackgroundTasks):
    if slug not in PAGE_SLUGS:
        return {"ok": False}
    try:
        body = PageviewEvent.model_validate(await request.json())
        sid = body.session_id
    except Exception:
        sid = "anon_" + hash_key(client_ip(request))
    bg.add_task(_safe, _record_pageview(slug, sid))
    return {"ok": True}
