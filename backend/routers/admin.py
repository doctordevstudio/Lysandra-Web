"""
Admin API. All routes except /login require Bearer <session_token>.
Tokens are random strings stored in Firebase at:
    admin/sessions/{token} = { username, created_at, ip, fingerprint }

Rate limiting: 3 failed logins -> device block for 60 min.
Password: plaintext comparison (env var ADMIN_PASSWORD).
No JWT. No hashing.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import settings
from models.schemas import (
    AdminLogin, CarouselIn, DialogIn, PageIn,
)
from services.firebase import db
from services.ratelimit import admin_limiter
from services.security import (
    client_ip, device_fingerprint, generate_session_token, verify_password,
)
from services.sanitize import clean_html

router = APIRouter(prefix="/api/admin", tags=["admin"])
bearer = HTTPBearer(auto_error=False)


# ================================================================
# Helpers
# ================================================================
async def audit(actor: str, action: str, meta: dict | None = None) -> None:
    """Append-only audit trail of admin writes."""
    await db.push(
        "admin/audit_log",
        {
            "ts": int(time.time()),
            "actor": actor,
            "action": action,
            "meta": meta or {},
        },
    )


# ================================================================
# Auth dependency — looks up the token in Firebase
# ================================================================
async def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
):
    if not creds:
        raise HTTPException(401, "Missing token")
    token = creds.credentials
    session = await db.get(f"admin/sessions/{token}")
    if not session or not isinstance(session, dict):
        raise HTTPException(401, "Invalid token")
    return {"sub": session.get("username", "admin"), "token": token}


# ================================================================
# Login
# ================================================================
@router.post("/login")
async def login(body: AdminLogin, request: Request):
    fp = device_fingerprint(request)
    ip = client_ip(request)

    # blocked?
    block = await db.get(f"admin/blocks/{fp}")
    if block and block.get("until", 0) > time.time():
        wait = int(block["until"] - time.time())
        raise HTTPException(423, f"Device blocked. Try again in {wait}s.")

    # rate limit per device
    ok, retry = admin_limiter.check(fp)
    if not ok:
        raise HTTPException(429, f"Too many attempts. Retry in {retry}s.")

    valid_user = body.username == settings.ADMIN_USERNAME
    valid_pass = verify_password(body.password, settings.ADMIN_PASSWORD)

    # log every attempt
    await db.push(
        "admin/login_attempts",
        {
            "ts": int(time.time()),
            "ip": ip,
            "fingerprint": fp,
            "username": body.username,
            "success": bool(valid_user and valid_pass),
            "ua": request.headers.get("user-agent", ""),
        },
    )

    if not (valid_user and valid_pass):
        fails_path = f"admin/fails/{fp}"
        cur = await db.get(fails_path) or 0
        cur = int(cur) + 1
        if cur >= settings.ADMIN_MAX_FAILS:
            await db.set(
                f"admin/blocks/{fp}",
                {
                    "until": int(time.time() + settings.ADMIN_BLOCK_MIN * 60),
                    "ip": ip,
                },
            )
            await db.delete(fails_path)
            raise HTTPException(
                423,
                f"Too many failed attempts. Device blocked for "
                f"{settings.ADMIN_BLOCK_MIN} minutes.",
            )
        await db.set(fails_path, cur)
        raise HTTPException(401, "Invalid credentials")

    # success — clear fails, create session token
    await db.delete(f"admin/fails/{fp}")
    token = generate_session_token()
    await db.set(
        f"admin/sessions/{token}",
        {
            "username": body.username,
            "created_at": int(time.time()),
            "ip": ip,
            "fingerprint": fp,
        },
    )
    return {"token": token, "expires_in": 0}  # 0 = never expires


# ================================================================
# Whoami + logout
# ================================================================
@router.get("/me")
async def me(admin=Depends(require_admin)):
    return {"username": admin["sub"]}


@router.post("/logout")
async def logout(admin=Depends(require_admin)):
    """Deletes the current session token from Firebase."""
    await db.delete(f"admin/sessions/{admin['token']}")
    return {"ok": True}


# ================================================================
# Dashboard stats
# ================================================================
@router.get("/stats")
async def stats(admin=Depends(require_admin), days: int = 30):
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)

    watch = await db.get("analytics/watch") or {}
    clicks_carousel = await db.get("analytics/clicks/carousel") or {}
    clicks_dialog = await db.get("analytics/clicks/dialog") or {}

    def sessions_on(day_key: str) -> set[str]:
        return set((watch.get(day_key) or {}).keys())

    today_sessions = sessions_on(today.strftime("%Y-%m-%d"))
    yest_sessions = sessions_on(yesterday.strftime("%Y-%m-%d"))
    all_sessions: set[str] = set()
    for day_key in watch.keys():
        all_sessions.update((watch[day_key] or {}).keys())

    def watch_count(day_key: str) -> int:
        day = watch.get(day_key) or {}
        return sum(len(movies or {}) for movies in day.values())

    today_watch = watch_count(today.strftime("%Y-%m-%d"))
    yest_watch = watch_count(yesterday.strftime("%Y-%m-%d"))
    all_watch = sum(watch_count(d) for d in watch.keys())

    def sum_clicks(store: dict) -> int:
        return sum(len(s) for s in store.values() if isinstance(s, dict))

    return {
        "users": {
            "today": len(today_sessions),
            "yesterday": len(yest_sessions),
            "all_time": len(all_sessions),
        },
        "watch": {
            "today": today_watch,
            "yesterday": yest_watch,
            "all_time": all_watch,
        },
        "clicks": {
            "carousel_total": sum_clicks(clicks_carousel),
            "dialog_total": sum_clicks(clicks_dialog),
        },
    }


@router.get("/stats/range")
async def stats_range(start: str, end: str, admin=Depends(require_admin)):
    try:
        d0 = datetime.strptime(start, "%Y-%m-%d").date()
        d1 = datetime.strptime(end, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Dates must be YYYY-MM-DD")

    watch = await db.get("analytics/watch") or {}
    sessions: set[str] = set()
    watch_count = 0
    day = d0
    while day <= d1:
        day_key = day.strftime("%Y-%m-%d")
        for sid, movies in (watch.get(day_key) or {}).items():
            sessions.add(sid)
            watch_count += len(movies or {})
        day += timedelta(days=1)

    return {
        "range": {"start": start, "end": end},
        "unique_users": len(sessions),
        "watch_count": watch_count,
    }


# ================================================================
# Carousel CRUD
# ================================================================
@router.get("/carousel")
async def admin_list_carousel(admin=Depends(require_admin)):
    raw = await db.get("carousel") or {}
    items = []
    for cid, item in raw.items():
        if not isinstance(item, dict):
            continue
        item["id"] = cid
        item.setdefault("clicks", 0)
        items.append(item)
    items.sort(key=lambda x: (x.get("sort", 0), x.get("id", "")))
    return {"results": items}


@router.post("/carousel")
async def admin_create_carousel(body: CarouselIn, admin=Depends(require_admin)):
    cid = await db.push(
        "carousel",
        {
            "image_url": body.image_url,
            "onclick_url": body.onclick_url,
            "sort": body.sort,
            "enabled": body.enabled,
            "clicks": 0,
        },
    )
    await audit(admin["sub"], "carousel.create", {"id": cid})
    return {"id": cid}


@router.put("/carousel/{cid}")
async def admin_update_carousel(
    cid: str, body: CarouselIn, admin=Depends(require_admin)
):
    await db.update(
        f"carousel/{cid}",
        {
            "image_url": body.image_url,
            "onclick_url": body.onclick_url,
            "sort": body.sort,
            "enabled": body.enabled,
        },
    )
    await audit(admin["sub"], "carousel.update", {"id": cid})
    return {"ok": True}


@router.delete("/carousel/{cid}")
async def admin_delete_carousel(cid: str, admin=Depends(require_admin)):
    await db.delete(f"carousel/{cid}")
    await audit(admin["sub"], "carousel.delete", {"id": cid})
    return {"ok": True}


# ================================================================
# Dialogs CRUD
# ================================================================
@router.get("/dialogs")
async def admin_list_dialogs(admin=Depends(require_admin)):
    raw = await db.get("dialogs") or {}
    items = []
    for did, d in raw.items():
        if not isinstance(d, dict):
            continue
        d["id"] = did
        items.append(d)
    items.sort(key=lambda x: (x.get("sort", 0), x.get("id", "")))
    return {"results": items}


@router.post("/dialogs")
async def admin_create_dialog(body: DialogIn, admin=Depends(require_admin)):
    content = body.content
    if body.type == "html":
        content = clean_html(content)
    did = await db.push(
        "dialogs",
        {
            "type": body.type,
            "content": content,
            "onclick_url": body.onclick_url,
            "sort": body.sort,
            "enabled": body.enabled,
            "total_views": 0,
        },
    )
    await audit(admin["sub"], "dialog.create", {"id": did})
    return {"id": did}


@router.put("/dialogs/{did}")
async def admin_update_dialog(
    did: str, body: DialogIn, admin=Depends(require_admin)
):
    content = body.content
    if body.type == "html":
        content = clean_html(content)
    await db.update(
        f"dialogs/{did}",
        {
            "type": body.type,
            "content": content,
            "onclick_url": body.onclick_url,
            "sort": body.sort,
            "enabled": body.enabled,
        },
    )
    await audit(admin["sub"], "dialog.update", {"id": did})
    return {"ok": True}


@router.delete("/dialogs/{did}")
async def admin_delete_dialog(did: str, admin=Depends(require_admin)):
    await db.delete(f"dialogs/{did}")
    await audit(admin["sub"], "dialog.delete", {"id": did})
    return {"ok": True}


# ================================================================
# Pages CRUD
# ================================================================
@router.get("/pages")
async def admin_list_pages(admin=Depends(require_admin)):
    raw = await db.get("pages") or {}
    return {"results": raw}


@router.put("/pages/{slug}")
async def admin_update_page(
    slug: str, body: PageIn, admin=Depends(require_admin)
):
    await db.set(
        f"pages/{slug}",
        {
            "slug": slug,
            "title": body.title,
            "html": clean_html(body.html),
            "enabled": body.enabled,
        },
    )
    await audit(admin["sub"], "page.update", {"slug": slug})
    return {"ok": True}


# ================================================================
# Logs
# ================================================================
@router.get("/logs/login")
async def login_logs(admin=Depends(require_admin), limit: int = 200):
    raw = await db.get("admin/login_attempts") or {}
    items = list(raw.values()) if isinstance(raw, dict) else []
    items.sort(key=lambda x: x.get("ts", 0), reverse=True)
    return {"results": items[:limit]}


@router.get("/logs/visits")
async def visit_logs(admin=Depends(require_admin), limit: int = 500):
    raw = await db.get("admin/visits") or {}
    items = list(raw.values()) if isinstance(raw, dict) else []
    items.sort(key=lambda x: x.get("ts", 0), reverse=True)
    return {"results": items[:limit]}


@router.get("/logs/audit")
async def audit_logs(admin=Depends(require_admin), limit: int = 200):
    raw = await db.get("admin/audit_log") or {}
    items = list(raw.values()) if isinstance(raw, dict) else []
    items.sort(key=lambda x: x.get("ts", 0), reverse=True)
    return {"results": items[:limit]}


# ================================================================
# Sessions management
# ================================================================
@router.get("/sessions")
async def list_sessions(admin=Depends(require_admin)):
    """List all active admin sessions."""
    raw = await db.get("admin/sessions") or {}
    items = []
    for token, info in raw.items():
        if isinstance(info, dict):
            items.append({
                "token_preview": token[:12] + "…",
                "username": info.get("username"),
                "created_at": info.get("created_at"),
                "ip": info.get("ip"),
            })
    items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return {"results": items}


@router.post("/sessions/revoke-all")
async def revoke_all_sessions(admin=Depends(require_admin)):
    """Logs out everywhere — useful if a token leaked."""
    await db.delete("admin/sessions")
    await audit(admin["sub"], "sessions.revoke_all", {})
    return {"ok": True}


# ================================================================
# Maintenance
# ================================================================
@router.post("/trim/visits")
async def trim_visits(keep_days: int = 7, admin=Depends(require_admin)):
    cutoff = int(time.time()) - keep_days * 86400
    raw = await db.get("admin/visits") or {}
    removed = 0
    for key, val in raw.items():
        if isinstance(val, dict) and val.get("ts", 0) < cutoff:
            await db.delete(f"admin/visits/{key}")
            removed += 1
    await audit(admin["sub"], "trim.visits", {"removed": removed, "keep_days": keep_days})
    return {"removed": removed}


# ================================================================
# One-time seed
# ================================================================
@router.post("/seed")
async def seed_endpoint(request: Request):
    """
    One-time seed. Requires ADMIN_USERNAME + ADMIN_PASSWORD in body.
    Delete or comment out this route after first use.
    """
    body = await request.json()
    if body.get("username") != settings.ADMIN_USERNAME:
        raise HTTPException(401, "Bad creds")
    if not verify_password(body.get("password", ""), settings.ADMIN_PASSWORD):
        raise HTTPException(401, "Bad creds")

    default_carousel = [
        {
            "image_url": "https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2295/360339c55650cce4ce7f01af944d7e59.jpg",
            "onclick_url": "/?movie=2295",
            "sort": 1,
            "enabled": True,
            "clicks": 0,
        },
        {
            "image_url": "https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2288/904a41748a67c1b614e162fe4a957d5b.jpg",
            "onclick_url": "/?movie=2288",
            "sort": 2,
            "enabled": True,
            "clicks": 0,
        },
    ]
    default_dialogs = [
        {
            "type": "html",
            "content": "<h3>Welcome to Lysandra</h3><p>Enjoy unlimited streaming.</p>",
            "onclick_url": None,
            "sort": 1,
            "enabled": True,
            "total_views": 0,
        },
    ]
    default_pages = {
        "privacy": {
            "slug": "privacy", "title": "Privacy Policy",
            "html": "<p>We respect your privacy.</p>", "enabled": True,
        },
        "terms": {
            "slug": "terms", "title": "Terms & Conditions",
            "html": "<p>Use Lysandra responsibly.</p>", "enabled": True,
        },
        "dmca": {
            "slug": "dmca", "title": "DMCA",
            "html": "<p>Report infringements to dmca@lysandra.app.</p>", "enabled": True,
        },
        "support": {
            "slug": "support", "title": "Customer Support",
            "html": "<p>Contact: t.me/drdevsupportbot</p>", "enabled": True,
        },
        "about": {
            "slug": "about", "title": "About Developer",
            "html": "<p>Dr. Dev || Dr. Hamza</p>", "enabled": True,
        },
    }

    if not (await db.get("carousel")):
        for item in default_carousel:
            await db.push("carousel", item)

    if not (await db.get("dialogs")):
        for d in default_dialogs:
            await db.push("dialogs", d)

    if not (await db.get("pages")):
        for slug, page in default_pages.items():
            await db.set(f"pages/{slug}", page)

    return {"ok": True, "seeded": True}
