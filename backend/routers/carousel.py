from __future__ import annotations

from fastapi import APIRouter, Request

from services.cache import cache
from services.firebase import db
from services.secure import seal

router = APIRouter(prefix="/api/carousel", tags=["carousel"])


async def public_items() -> list[dict]:
    hit = cache.get("carousel")
    if hit is not None:
        return hit
    raw = await db.get("carousel") or {}
    items = []
    for cid, it in raw.items():
        if not isinstance(it, dict) or it.get("enabled", True) is False:
            continue
        items.append({
            "id": cid, "image_url": it.get("image_url", ""), "onclick_url": it.get("onclick_url", ""),
            "sort": it.get("sort", 0), "enabled": True,
        })
    items.sort(key=lambda x: (x["sort"], x["id"]))
    return cache.set("carousel", items, 20)


@router.get("")
async def list_carousel(request: Request):
    return seal(request, {"results": await public_items()})
