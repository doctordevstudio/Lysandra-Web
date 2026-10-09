"""
Live TV. The upstream API is only ever called from here; the browser never sees its address.
  GET /api/livetv        -> channel list (title, poster, description). NO stream URLs.
  GET /api/livetv/{id}   -> one channel including its playable sources (fetched when the user presses Play).
Both responses are encrypted for the caller (see services/secure.py).
"""
from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Request

from config import settings
from services.cache import cache
from services.secure import seal
from services.upstream import UpstreamError, upstream

router = APIRouter(prefix="/api/livetv", tags=["livetv"])
_HTTP = re.compile(r"^https?://\S+$", re.I)


def _s(v, n: int) -> str:
    return str(v or "").strip()[:n]


def _normalize(raw) -> list[dict]:
    out: list[dict] = []
    rows = raw.get("results") if isinstance(raw, dict) else None
    for ch in rows or []:
        if not isinstance(ch, dict) or ch.get("enabled") is False:
            continue
        try:
            cid = int(ch.get("id"))
        except (TypeError, ValueError):
            continue
        players, seen = [], set()
        for p in ch.get("players") or []:
            url = _s(p.get("url") if isinstance(p, dict) else "", 800)
            if not _HTTP.match(url) or url in seen:  # also drops duplicate sources
                continue
            seen.add(url)
            players.append({
                "translator": _s(p.get("translator"), 80), "url": url,
                "source": _s(p.get("source"), 12).lower(), "quality": _s(p.get("quality"), 12),
            })
        if not players:
            continue
        poster = _s(ch.get("poster_url"), 600)
        out.append({
            "id": cid, "title": _s(ch.get("title"), 120), "description": _s(ch.get("description"), 600),
            "poster": poster if _HTTP.match(poster) else "", "players": players,
        })
    return out


async def _channels() -> list[dict]:
    hit = cache.get("livetv")
    if hit is not None:
        return hit
    try:
        raw = await upstream.fetch_urls([settings.LIVETV_URL, settings.LIVETV_FALLBACK], ttl=120)
    except UpstreamError:
        raise HTTPException(502, "Live TV is temporarily unavailable")
    return cache.set("livetv", _normalize(raw), 120)


@router.get("")
async def list_channels(request: Request):
    rows = [
        {"id": c["id"], "title": c["title"], "description": c["description"],
         "poster": c["poster"], "count": len(c["players"])}
        for c in await _channels()
    ]
    return seal(request, {"results": rows})


@router.get("/{cid}")
async def get_channel(cid: int, request: Request):
    for c in await _channels():
        if c["id"] == cid:
            return seal(request, c)
    raise HTTPException(404, "Channel not found")
