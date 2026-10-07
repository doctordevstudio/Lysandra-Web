"""
Admin API. Everything except /login requires  Authorization: Bearer <token>.

Sessions : admin/sessions/{sha256(token)} = {username, created_at, expires_at, ip, device, ua}
Blocking : 3 failed logins (configurable) block BOTH the IP and the device fingerprint for 60 min.
Logs     : admin/login_attempts, admin/panel_visits (admin website), admin/visits (user website),
           admin/audit_log (every admin write).
"""
from __future__ import annotations

import asyncio
import re
import time
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings
from models.schemas import AdminLogin, CarouselIn, DialogIn, PageIn
from routers.pages import page_data
from services import counters, settings_store
from services.cache import cache
from services.defaults import PAGE_SLUGS
from services.firebase import db
from services.ratelimit import admin_limiter
from services.sanitize import clean_html
from services.security import (
    client_ip, device_ids, new_token, token_id, verify_credentials,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
bearer = HTTPBearer(auto_error=False)
_ID = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _id(v: str) -> str:
    if not _ID.match(v):
        raise HTTPException(400, "Bad id")
    return v


def _day(v: str) -> str:
    if not _DAY.match(v):
        raise HTTPException(400, "Dates must be YYYY-MM-DD")
    try:
        counters.parse_day(v)
    except ValueError:
        raise HTTPException(400, "Invalid date")
    return v


async def audit(actor: str, action: str, meta: dict | None = None) -> None:
    try:
        await db.push("admin/audit_log", {"ts": int(time.time()), "actor": actor, "action": action, "meta": meta or {}})
    except Exception:
        pass


async def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not creds:
        raise HTTPException(401, "Missing token")
    tid = token_id(creds.credentials)
    s = await db.get(f"admin/sessions/{tid}")
    if not isinstance(s, dict):
        raise HTTPException(401, "Invalid or expired session")
    if s.get("expires_at", 0) and s["expires_at"] < time.time():
        await db.delete(f"admin/sessions/{tid}")
        raise HTTPException(401, "Session expired")
    return {"sub": s.get("username", "admin"), "tid": tid}


# ================================================================ Login
@router.post("/login")
async def login(body: AdminLogin, request: Request):
    ip = client_ip(request)
    ip_id, dev_id = device_ids(request, body.fingerprint)
    ua = request.headers.get("user-agent", "")[:200]
    cfg = (await settings_store.load())["limits"]

    async def log_attempt(result: str, ok: bool = False):
        await db.push("admin/login_attempts", {
            "ts": int(time.time()), "ip": ip, "device": dev_id, "username": body.username[:60],
            "success": ok, "result": result, "ua": ua,
        })

    now = time.time()
    for bid in (ip_id, dev_id):
        blk = await db.get(f"admin/blocks/{bid}")
        if isinstance(blk, dict) and blk.get("until", 0) > now:
            await log_attempt("blocked")
            raise HTTPException(423, f"Device blocked. Try again in {int((blk['until'] - now) // 60) + 1} min.")

    okl, retry = admin_limiter.check(ip_id)
    if not okl:
        raise HTTPException(429, f"Too many attempts. Retry in {retry}s.")

    if not verify_credentials(body.username, body.password):
        await log_attempt("fail")
        tripped = False
        for bid in (ip_id, dev_id):
            await db.incr(f"admin/fails/{bid}")
            n = await db.get(f"admin/fails/{bid}") or 0
            tripped = tripped or int(n) >= cfg["admin_max_fails"]
        if tripped:
            until = int(now + cfg["admin_block_min"] * 60)
            for bid in (ip_id, dev_id):
                await db.set(f"admin/blocks/{bid}", {"until": until, "ip": ip, "device": dev_id, "ua": ua, "at": int(now)})
                await db.delete(f"admin/fails/{bid}")
            raise HTTPException(423, f"Too many failed attempts. Device blocked for {cfg['admin_block_min']} minutes.")
        raise HTTPException(401, "Invalid credentials")

    for bid in (ip_id, dev_id):
        await db.delete(f"admin/fails/{bid}")
    await log_attempt("ok", True)
    # drop expired sessions
    sess = await db.get("admin/sessions") or {}
    for k, v in sess.items():
        if isinstance(v, dict) and v.get("expires_at", 0) < now:
            await db.delete(f"admin/sessions/{k}")
    token = new_token()
    ttl = settings.ADMIN_SESSION_HOURS * 3600
    await db.set(f"admin/sessions/{token_id(token)}", {
        "username": settings.ADMIN_USERNAME, "created_at": int(now), "expires_at": int(now + ttl),
        "ip": ip, "device": dev_id, "ua": ua,
    })
    return {"token": token, "expires_in": ttl}


@router.get("/me")
async def me(admin=Depends(require_admin)):
    return {"username": admin["sub"]}


@router.post("/logout")
async def logout(admin=Depends(require_admin)):
    await db.delete(f"admin/sessions/{admin['tid']}")
    return {"ok": True}


# ================================================================ Stats
@router.get("/stats")
async def stats(admin=Depends(require_admin)):
    nu, act, old, watch = await asyncio.gather(*(counters.series(m) for m in ("new_users", "active", "old_active", "watch")))
    car, dia = await counters.all_series("click_carousel"), await counters.all_series("view_dialog")
    t, y = counters.today(), counters.yesterday()
    return {
        "users": {"today": nu.get(t, 0), "yesterday": nu.get(y, 0), "all_time": sum(nu.values()),
                  "active_today": act.get(t, 0), "active_yesterday": act.get(y, 0),
                  "old_active_yesterday": old.get(y, 0)},
        "watch": {"today": watch.get(t, 0), "yesterday": watch.get(y, 0), "all_time": sum(watch.values())},
        "clicks": {"carousel_total": sum(sum(s.values()) for s in car.values()),
                   "dialog_total": sum(sum(s.values()) for s in dia.values())},
        "today": t,
    }


@router.get("/stats/range")
async def stats_range(start: str, end: str, admin=Depends(require_admin)):
    start, end = _day(start), _day(end)
    try:
        nu, act, watch = await asyncio.gather(*(counters.series(m) for m in ("new_users", "active", "watch")))
        return {"range": {"start": start, "end": end}, "new_users": counters.in_range(nu, start, end),
                "active_users": counters.in_range(act, start, end), "watch_count": counters.in_range(watch, start, end)}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/stats/series")
async def stats_series(days: int = Query(14, ge=2, le=90), admin=Depends(require_admin)):
    nu, act, watch = await asyncio.gather(*(counters.series(m) for m in ("new_users", "active", "watch")))
    base = counters.local_now().date()
    out = []
    for i in range(days - 1, -1, -1):
        d = (base - timedelta(days=i)).strftime("%Y-%m-%d")
        out.append({"day": d, "new_users": nu.get(d, 0), "active": act.get(d, 0), "watch": watch.get(d, 0)})
    return {"results": out}


_METRIC = {"page": "page_view", "carousel": "click_carousel", "dialog": "view_dialog"}


@router.get("/metric/range")
async def metric_range(metric: str, id: str, start: str, end: str, admin=Depends(require_admin)):
    if metric not in _METRIC:
        raise HTTPException(400, "Unknown metric")
    start, end = _day(start), _day(end)
    try:
        return {"count": counters.in_range(await counters.series(_METRIC[metric], _id(id)), start, end)}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ================================================================ Carousel
@router.get("/carousel")
async def admin_list_carousel(admin=Depends(require_admin)):
    raw, st = await db.get("carousel") or {}, await counters.all_series("click_carousel")
    items = []
    for cid, it in raw.items():
        if isinstance(it, dict):
            items.append({**it, "id": cid, "stats": counters.summary(st.get(cid, {}))})
    items.sort(key=lambda x: (x.get("sort", 0), x["id"]))
    return {"results": items}


def _car(b: CarouselIn) -> dict:
    return {"image_url": b.image_url, "onclick_url": b.onclick_url, "sort": b.sort, "enabled": b.enabled}


@router.post("/carousel")
async def admin_create_carousel(body: CarouselIn, admin=Depends(require_admin)):
    cid = await db.push("carousel", {**_car(body), "clicks": 0})
    cache.drop("carousel")
    await audit(admin["sub"], "carousel.create", {"id": cid})
    return {"id": cid}


@router.put("/carousel/{cid}")
async def admin_update_carousel(cid: str, body: CarouselIn, admin=Depends(require_admin)):
    _id(cid)
    if await db.get(f"carousel/{cid}/enabled") is None:
        raise HTTPException(404, "Not found")
    await db.update(f"carousel/{cid}", _car(body))
    cache.drop("carousel")
    await audit(admin["sub"], "carousel.update", {"id": cid})
    return {"ok": True}


@router.delete("/carousel/{cid}")
async def admin_delete_carousel(cid: str, admin=Depends(require_admin)):
    _id(cid)
    await db.delete(f"carousel/{cid}")
    await db.delete(f"counters/click_carousel/{cid}")
    await db.delete(f"analytics/clicks/carousel/{cid}")
    cache.drop("carousel")
    await audit(admin["sub"], "carousel.delete", {"id": cid})
    return {"ok": True}


# ================================================================ Dialogs
def _dlg(b: DialogIn) -> dict:
    content = clean_html(b.content) if b.type == "html" else b.content.strip()
    if b.type == "image" and not re.match(r"^https?://[^\s]+$", content, re.I):
        raise HTTPException(422, "Image dialogs need an http(s) image URL")
    return {"type": b.type, "content": content, "onclick_url": b.onclick_url, "sort": b.sort, "enabled": b.enabled}


@router.get("/dialogs")
async def admin_list_dialogs(admin=Depends(require_admin)):
    raw, st = await db.get("dialogs") or {}, await counters.all_series("view_dialog")
    items = [{**d, "id": k, "stats": counters.summary(st.get(k, {}))} for k, d in raw.items() if isinstance(d, dict)]
    items.sort(key=lambda x: (x.get("sort", 0), x["id"]))
    return {"results": items}


@router.post("/dialogs")
async def admin_create_dialog(body: DialogIn, admin=Depends(require_admin)):
    did = await db.push("dialogs", {**_dlg(body), "total_views": 0})
    cache.drop("dialogs")
    await audit(admin["sub"], "dialog.create", {"id": did})
    return {"id": did}


@router.put("/dialogs/{did}")
async def admin_update_dialog(did: str, body: DialogIn, admin=Depends(require_admin)):
    _id(did)
    if await db.get(f"dialogs/{did}/enabled") is None:
        raise HTTPException(404, "Not found")
    await db.update(f"dialogs/{did}", _dlg(body))
    cache.drop("dialogs")
    await audit(admin["sub"], "dialog.update", {"id": did})
    return {"ok": True}


@router.delete("/dialogs/{did}")
async def admin_delete_dialog(did: str, admin=Depends(require_admin)):
    _id(did)
    await db.delete(f"dialogs/{did}")
    await db.delete(f"counters/view_dialog/{did}")
    await db.delete(f"analytics/clicks/dialog/{did}")
    cache.drop("dialogs")
    await audit(admin["sub"], "dialog.delete", {"id": did})
    return {"ok": True}


# ================================================================ Pages
@router.get("/pages")
async def admin_list_pages(admin=Depends(require_admin)):
    st = await counters.all_series("page_view")
    out = {}
    for slug in PAGE_SLUGS:
        out[slug] = {**await page_data(slug), "views": counters.summary(st.get(slug, {}))}
    return {"results": out}


@router.put("/pages/{slug}")
async def admin_update_page(slug: str, body: PageIn, admin=Depends(require_admin)):
    if slug not in PAGE_SLUGS:
        raise HTTPException(404, "Unknown page")
    await db.set(f"pages/{slug}", {"slug": slug, "title": body.title.strip(), "html": clean_html(body.html), "enabled": body.enabled})
    cache.drop(f"page:{slug}")
    await audit(admin["sub"], "page.update", {"slug": slug})
    return {"ok": True}


# ================================================================ Logs
def _rows(raw) -> list[dict]:
    return [v for v in raw.values() if isinstance(v, dict)] if isinstance(raw, dict) else []


async def _log(path: str, limit: int) -> dict:
    rows = _rows(await db.get_last(path, limit))
    rows.sort(key=lambda x: x.get("ts", 0), reverse=True)
    return {"results": rows[:limit]}


@router.get("/logs/login")
async def login_logs(limit: int = Query(200, ge=1, le=1000), admin=Depends(require_admin)):
    return await _log("admin/login_attempts", limit)


@router.get("/logs/panel")
async def panel_logs(limit: int = Query(200, ge=1, le=1000), admin=Depends(require_admin)):
    return await _log("admin/panel_visits", limit)


@router.get("/logs/visits")
async def visit_logs(limit: int = Query(300, ge=1, le=1000), admin=Depends(require_admin)):
    return await _log("admin/visits", limit)


@router.get("/logs/audit")
async def audit_logs(limit: int = Query(200, ge=1, le=1000), admin=Depends(require_admin)):
    return await _log("admin/audit_log", limit)


# ================================================================ Security
@router.get("/blocks")
async def list_blocks(admin=Depends(require_admin)):
    raw, now = await db.get("admin/blocks") or {}, time.time()
    items = [{**v, "id": k} for k, v in raw.items() if isinstance(v, dict) and v.get("until", 0) > now]
    items.sort(key=lambda x: x.get("at", 0), reverse=True)
    return {"results": items}


@router.delete("/blocks/{bid}")
async def unblock(bid: str, admin=Depends(require_admin)):
    _id(bid)
    blk = await db.get(f"admin/blocks/{bid}")
    ids = {bid}
    if isinstance(blk, dict) and blk.get("device"):  # a block always covers the ip + device pair
        ids.add(blk["device"])
        ids.update(k for k, v in (await db.get("admin/blocks") or {}).items() if isinstance(v, dict) and v.get("device") == blk["device"])
    for i in ids:
        await db.delete(f"admin/blocks/{i}")
        await db.delete(f"admin/fails/{i}")
        admin_limiter.reset(i)
    await audit(admin["sub"], "block.remove", {"id": bid})
    return {"ok": True}


@router.get("/sessions")
async def list_sessions(admin=Depends(require_admin)):
    raw, now = await db.get("admin/sessions") or {}, time.time()
    items = [{"id": k[:10], "current": k == admin["tid"], "created_at": v.get("created_at"),
              "expires_at": v.get("expires_at"), "ip": v.get("ip"), "ua": v.get("ua", "")[:80]}
             for k, v in raw.items() if isinstance(v, dict) and v.get("expires_at", 0) > now]
    items.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
    return {"results": items}


@router.post("/sessions/revoke-all")
async def revoke_all_sessions(admin=Depends(require_admin)):
    await db.delete("admin/sessions")
    await audit(admin["sub"], "sessions.revoke_all")
    return {"ok": True}


# ================================================================ Settings
@router.get("/settings")
async def get_settings(admin=Depends(require_admin)):
    return await settings_store.load(force=True)


@router.put("/settings")
async def put_settings(request: Request, admin=Depends(require_admin)):
    try:
        saved = await settings_store.save(await request.json())
    except ValueError as e:
        raise HTTPException(422, str(e))
    await audit(admin["sub"], "settings.update")
    return saved


# ================================================================ Maintenance
@router.post("/trim")
async def trim(keep_days: int = Query(30, ge=1, le=365), admin=Depends(require_admin)):
    """Delete old raw logs / per-session markers (counters are kept)."""
    cutoff = int(time.time()) - keep_days * 86400
    removed = 0
    for node in ("admin/visits", "admin/panel_visits", "admin/login_attempts", "admin/audit_log"):
        for k, v in (await db.get(node) or {}).items():
            if isinstance(v, dict) and v.get("ts", 0) < cutoff:
                await db.delete(f"{node}/{k}")
                removed += 1
    keep_from = (counters.local_now() - timedelta(days=keep_days)).strftime("%Y-%m-%d")
    for node in ("analytics/active", "analytics/watch"):
        for day in list((await db.get(node) or {}).keys()):
            if day < keep_from:
                await db.delete(f"{node}/{day}")
                removed += 1
    await audit(admin["sub"], "trim", {"removed": removed, "keep_days": keep_days})
    return {"removed": removed}
