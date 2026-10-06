from __future__ import annotations

from fastapi import APIRouter

from services.firebase import db

router = APIRouter(prefix="/api/dialogs", tags=["dialogs"])


@router.get("")
async def list_dialogs():
    raw = await db.get("dialogs") or {}
    items = []
    for did, d in raw.items():
        if not isinstance(d, dict):
            continue
        d["id"] = did
        d.setdefault("enabled", True)
        d.setdefault("sort", 0)
        d.setdefault("total_views", 0)
        if d["enabled"]:
            items.append(d)
    items.sort(key=lambda x: (x.get("sort", 0), x.get("id", "")))
    return {"results": items}