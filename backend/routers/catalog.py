"""
Public catalog proxy. Frontend calls /api/catalog/{kind} and never
sees the upstream origin. Kinds: bollywood, hollywood, serials.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from services.ratelimit import public_limiter
from services.security import client_ip
from services.upstream import upstream

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

ALLOWED_KINDS = {"bollywood", "hollywood", "serials"}


@router.get("/{kind}")
async def catalog(
    kind: str,
    request: Request,
    page: int = Query(1, ge=1, le=500),
    limit: int = Query(20, ge=1, le=50),
    title: str | None = Query(None, min_length=1, max_length=100),
):
    if kind not in ALLOWED_KINDS:
        raise HTTPException(404, "Unknown catalog")

    ip = client_ip(request)
    ok, retry = public_limiter.check(ip)
    if not ok:
        raise HTTPException(
            429,
            f"Rate limit exceeded. Try again in {retry}s.",
            headers={"Retry-After": str(retry)},
        )

    params = {"page": page, "limit": limit}
    if title:
        params["title"] = title

    try:
        data = await upstream.fetch(kind, params)
    except Exception as e:
        raise HTTPException(502, f"Upstream error: {e}")

    return data