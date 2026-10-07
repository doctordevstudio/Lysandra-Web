from __future__ import annotations

from fastapi import APIRouter, Request

from services.cache import cache
from services.firebase import db
from services.secure import seal

router = APIRouter(prefix="/api/dialogs", tags=["dialogs"])


@router.get("")
async def list_dialogs(request: Request):
    items = cache.get("dialogs")
    if items is None:
        raw = await db.get("dialogs") or {}
        items = []
        for did, d in raw.items():
            if not isinstance(d, dict) or d.get("enabled", True) is False:
                continue
            items.append({
                "id": did, "type": d.get("type", "text"), "content": d.get("content", ""),
                "onclick_url": d.get("onclick_url"), "sort": d.get("sort", 0), "enabled": True,
            })
        items.sort(key=lambda x: (x["sort"], x["id"]))
        cache.set("dialogs", items, 20)
    return seal(request, {"results": items})
