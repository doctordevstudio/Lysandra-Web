from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services.firebase import db

router = APIRouter(prefix="/api/pages", tags=["pages"])

ALLOWED = {"privacy", "terms", "dmca", "support", "about"}


@router.get("/{slug}")
async def get_page(slug: str):
    if slug not in ALLOWED:
        raise HTTPException(404, "Unknown page")
    data = await db.get(f"pages/{slug}")
    if not data:
        return {"slug": slug, "title": slug.title(), "html": "<p>Coming soon.</p>"}
    return data