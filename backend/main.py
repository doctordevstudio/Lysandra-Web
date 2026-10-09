"""
Lysandra backend + static frontend server (FastAPI).
Public data endpoints are AES-GCM encrypted (see services/secure.py); admin endpoints use bearer sessions.
"""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from routers import admin, analytics, carousel, catalog, dialogs, livetv, pages, public
from services import settings_store
from services.firebase import BadKey, DBError, db
from services.headers import SecurityHeadersMiddleware
from services.ratelimit import public_limiter
from services.security import client_ip, hash_key
from services.upstream import upstream

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("lysandra")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.FIREBASE_RTDB_URL:
        log.error("FIREBASE_RTDB_URL is not set — database features will fail")
    if not (settings.ADMIN_PASSWORD or settings.ADMIN_PASSWORD_HASH):
        log.error("No ADMIN_PASSWORD / ADMIN_PASSWORD_HASH set — admin login is disabled")
    try:
        await settings_store.load(force=True)
    except Exception as e:
        log.warning("settings preload failed: %s", e)
    log.info("Frontend dir: %s", settings.frontend_path)
    yield
    await db.close()
    await upstream.close()


app = FastAPI(title="Lysandra API", version="2.0.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


# ---------------- errors ----------------
@app.exception_handler(DBError)
async def _db_err(request: Request, exc: DBError):
    log.error("DB error on %s: %s", request.url.path, exc)
    return JSONResponse({"detail": "Service temporarily unavailable"}, status_code=503)


@app.exception_handler(BadKey)
async def _bad_key(request: Request, exc: BadKey):
    return JSONResponse({"detail": "Bad request"}, status_code=400)


# ---------------- rate limit (the ONLY place public requests are counted) ----------------
_EXEMPT = ("/health", "/sw.js", "/config.js", "/favicon.ico", "/css/", "/js/", "/assets/", "/api/admin", "/api/secure/key")


async def rate_limit(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or path.startswith(_EXEMPT):
        return await call_next(request)
    ok, retry = public_limiter.check(client_ip(request))
    if not ok:
        return JSONResponse({"detail": f"Rate limit. Retry in {retry}s."}, status_code=429, headers={"Retry-After": str(retry)})
    return await call_next(request)


# add_middleware: last added = outermost
app.add_middleware(BaseHTTPMiddleware, dispatch=rate_limit)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.ALLOWED_ORIGINS or ["*"], allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["*"],
    expose_headers=["X-Enc", "Retry-After"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=800)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "lysandra"}


for r in (public.router, catalog.router, livetv.router, carousel.router, dialogs.router, pages.router, analytics.router, admin.router):
    app.include_router(r)


# ---------------- static frontend ----------------
class CachedStatic(StaticFiles):
    def __init__(self, *a, cache: str, **kw):
        super().__init__(*a, **kw)
        self._cache = cache

    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        if resp.status_code == 200:
            resp.headers["Cache-Control"] = self._cache
        return resp


FE = settings.frontend_path
if FE.exists():
    NO_CACHE = {"Cache-Control": "no-cache"}

    @app.get("/admin", include_in_schema=False)
    @app.get("/admin/", include_in_schema=False)
    async def _admin_index(request: Request):
        """Serving the admin page is itself logged (admin-website log)."""
        try:
            await db.push("admin/panel_visits", {
                "ts": int(time.time()), "ip": client_ip(request), "device": "ip_" + hash_key(client_ip(request)),
                "ua": request.headers.get("user-agent", "")[:200], "path": "/admin",
            })
        except Exception as e:
            log.warning("panel visit log failed: %s", e)
        return FileResponse(FE / "admin.html", headers=NO_CACHE)

    @app.get("/sw.js", include_in_schema=False)
    async def _service_worker():
        """Monetag service worker; zone comes from admin Settings (defaults to the push zone)."""
        s = await settings_store.load()
        zone = settings_store.sw_zone(s)
        if zone:
            body = (
                f'self.options = {{"domain": "5gvci.com", "zoneId": {int(zone)}}};\n'
                'self.lary = "";\n'
                "importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw');\n"
            )
            return PlainTextResponse(body, media_type="application/javascript",
                                     headers={"Service-Worker-Allowed": "/", "Cache-Control": "public, max-age=300"})
        f = FE / "sw.js"
        if f.is_file():
            return FileResponse(f, media_type="application/javascript", headers={"Service-Worker-Allowed": "/"})
        return JSONResponse({"detail": "Not Found"}, status_code=404)

    @app.get("/config.js", include_in_schema=False)
    async def _config_js():
        return FileResponse(FE / "config.js", media_type="application/javascript", headers=NO_CACHE)

    @app.get("/favicon.ico", include_in_schema=False)
    async def _favicon():
        return RedirectResponse("/assets/icon-96.png", status_code=302)

    for sub, cc in (("css", "no-cache"), ("js", "no-cache"), ("assets", "public, max-age=86400")):
        if (FE / sub).exists():
            app.mount(f"/{sub}", CachedStatic(directory=str(FE / sub), cache=cc), name=sub)

    @app.get("/", include_in_schema=False)
    async def _index():
        return FileResponse(FE / "index.html", headers=NO_CACHE)

    @app.get("/{path:path}", include_in_schema=False)
    async def _spa_fallback(path: str):
        """Only extension-less paths get index.html; no arbitrary file is ever served from disk here."""
        if path.startswith("api/") or "." in path.rsplit("/", 1)[-1]:
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        return FileResponse(FE / "index.html", headers=NO_CACHE)
else:
    log.warning("Frontend dir not found at %s — API only", FE)
