from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from services.cache import cache
from services.defaults import DEFAULT_PAGES, PAGE_SLUGS
from services.firebase import db
from services.secure import seal

router = APIRouter(prefix="/api/pages", tags=["pages"])


async def page_data(slug: str) -> dict:
    stored = await db.get(f"pages/{slug}")
    d = DEFAULT_PAGES[slug]
    out = {"slug": slug, "title": d["title"], "html": d["html"], "enabled": True}
    if isinstance(stored, dict):
        out.update({k: stored[k] for k in ("title", "html", "enabled") if k in stored})
    return out


@router.get("/{slug}")
async def get_page(slug: str, request: Request):
    if slug not in PAGE_SLUGS:
        raise HTTPException(404, "Unknown page")
    data = cache.get(f"page:{slug}")
    if data is None:
        data = cache.set(f"page:{slug}", await page_data(slug), 20)
    if data.get("enabled") is False:
        raise HTTPException(404, "Page disabled")
    return seal(request, data)
