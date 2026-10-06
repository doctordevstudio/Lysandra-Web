"""
Optional server-side watch history. The frontend primarily uses
localStorage, but exposing this lets you later add cross-device sync.
For now it's a thin wrapper that writes to Firebase.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Request
from pydantic import BaseModel

from services.firebase import db
from services.security import client_ip

router = APIRouter(prefix="/api/history", tags=["history"])


class HistoryItem(BaseModel):
    kinopoisk_id: int
    title: str
    poster: str | None = None
    source: str | None = None


@router.get("/{session_id}")
async def get_history(session_id: str, limit: int = 100):
    raw = await db.get(f"history/{session_id}") or {}
    items = [v for v in raw.values() if isinstance(v, dict)]
    items.sort(key=lambda x: x.get("ts", 0), reverse=True)
    return {"results": items[:limit]}


@router.post("/{session_id}")
async def add_history(session_id: str, item: HistoryItem, request: Request):
    await db.set(
        f"history/{session_id}/{item.kinopoisk_id}",
        {
            "kinopoisk_id": item.kinopoisk_id,
            "title": item.title,
            "poster": item.poster,
            "source": item.source,
            "ts": int(time.time() * 1000),
            "ip": client_ip(request),
        },
    )
    return {"ok": True}


@router.delete("/{session_id}")
async def clear_history(session_id: str):
    await db.delete(f"history/{session_id}")
    return {"ok": True}