"""Public catalog proxy: /api/catalog/{kind}. Kinds: bollywood, hollywood, serials."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from services.secure import seal
from services.upstream import UpstreamError, upstream

router = APIRouter(prefix="/api/catalog", tags=["catalog"])
ALLOWED_KINDS = {"bollywood", "hollywood", "serials"}


@router.get("/{kind}")
async def catalog(
    kind: str,
    request: Request,
    page: int = Query(1, ge=1, le=500),
    limit: int = Query(20, ge=1, le=50),
    title: str | None = Query(None, max_length=100),
):
    if kind not in ALLOWED_KINDS:
        raise HTTPException(404, "Unknown catalog")
    params: dict = {"page": page, "limit": limit}
    if title and title.strip():
        params["title"] = title.strip()
    try:
        data = await upstream.fetch(kind, params)
    except UpstreamError:
        raise HTTPException(502, "Catalog is temporarily unavailable")
    return seal(request, data)
