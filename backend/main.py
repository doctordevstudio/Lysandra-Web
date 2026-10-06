"""
Lysandra backend + static frontend server.
- FastAPI + async httpx
- In-memory rate limiting (per IP)
- Firebase RTDB via REST /.json
- Proxies upstream catalog, hides origin
- Serves /frontend at / (index.html) and /admin (admin.html)
- Serves /sw.js for Monetag service worker verification
- Session-token auth (no JWT, no hashing)
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from routers import (
    admin, analytics, carousel, catalog, dialogs, history, pages,
)
from services.firebase import db
from services.ratelimit import public_limiter
from services.security import client_ip
from services.upstream import upstream
from services.headers import SecurityHeadersMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("lysandra")


# ================================================================
# Lifespan — startup / shutdown
# ================================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Lysandra starting up")
    log.info("Frontend dir: %s", settings.frontend_path)
    yield
    await db.close()
    await upstream.close()
    log.info("Lysandra shut down")


# ================================================================
# App
# ================================================================
app = FastAPI(
    title="Lysandra API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)


# ================================================================
# Middleware (order matters: last added = outermost)
# ================================================================
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Global per-IP rate limit for public routes."""
    path = request.url.path

    # Skip rate limit for admin, health, static assets, docs, sw.js
    if (
        path.startswith("/api/admin")
        or path in ("/health", "/docs", "/openapi.json", "/sw.js")
        or path.startswith("/css/")
        or path.startswith("/js/")
        or path.startswith("/assets/")
    ):
        return await call_next(request)

    ip = client_ip(request)
    ok, retry = public_limiter.check(ip)
    if not ok:
        return JSONResponse(
            status_code=429,
            content={"detail": f"Rate limit. Retry in {retry}s."},
            headers={"Retry-After": str(retry)},
        )
    return await call_next(request)


# ================================================================
# Health check
# ================================================================
@app.get("/health")
async def health():
    return {"status": "ok", "service": "lysandra"}


# ================================================================
# API routers (registered FIRST so /api/* wins over SPA fallback)
# ================================================================
app.include_router(catalog.router)
app.include_router(carousel.router)
app.include_router(dialogs.router)
app.include_router(pages.router)
app.include_router(history.router)
app.include_router(analytics.router)
app.include_router(admin.router)


# ================================================================
# Static frontend (mounted LAST so it's a fallback)
# ================================================================
FE = settings.frontend_path

if FE.exists():
    # ---------------- /admin → admin.html ----------------
    @app.get("/admin", include_in_schema=False)
    @app.get("/admin/", include_in_schema=False)
    async def _admin_index():
        return FileResponse(FE / "admin.html")

    # ---------------- /sw.js → Monetag service worker ----------------
    @app.get("/sw.js", include_in_schema=False)
    async def _service_worker():
        sw_path = FE / "sw.js"
        if sw_path.is_file():
            return FileResponse(
                sw_path,
                media_type="application/javascript",
                headers={
                    "Service-Worker-Allowed": "/",
                    "Cache-Control": "public, max-age=3600",
                },
            )
        return JSONResponse({"detail": "sw.js not found"}, status_code=404)

    # ---------------- Static dirs ----------------
    for sub in ("css", "js", "assets"):
        p = FE / sub
        if p.exists():
            app.mount(f"/{sub}", StaticFiles(directory=str(p)), name=sub)

    # ---------------- Root → index.html ----------------
    @app.get("/", include_in_schema=False)
    async def _index():
        return FileResponse(FE / "index.html")

    # ---------------- SPA fallback ----------------
    @app.get("/{path:path}", include_in_schema=False)
    async def _spa_fallback(path: str):
        # Never hijack API / docs / openapi paths
        if (
            path.startswith("api/")
            or path.startswith("docs")
            or path.startswith("openapi")
        ):
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        candidate = FE / path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FE / "index.html")

else:
    log.warning("Frontend dir not found at %s — API only", FE)
