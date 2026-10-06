from __future__ import annotations

from fastapi import APIRouter, HTTPException

from services.firebase import db

router = APIRouter(prefix="/api/carousel", tags=["carousel"])


@router.get("")
async def list_carousel():
    """Public: returns enabled carousel items sorted by `sort` ascending."""
    raw = await db.get("carousel") or {}
    items = []
    for cid, item in raw.items():
        if not isinstance(item, dict):
            continue
        item["id"] = cid
        item.setdefault("enabled", True)
        item.setdefault("sort", 0)
        item.setdefault("clicks", 0)
        if item["enabled"]:
            items.append(item)
    items.sort(key=lambda x: (x.get("sort", 0), x.get("id", "")))
    return {"results": items}