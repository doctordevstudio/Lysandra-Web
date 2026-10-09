"""Public settings / ads / encryption key."""
from __future__ import annotations

import time

from fastapi import APIRouter, Request

from config import settings
from services import settings_store
from services.secure import SERVER_PUB, seal

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/secure/key")
async def secure_key():
    return {"pub": SERVER_PUB, "enabled": settings.ENCRYPT_API, "now": int(time.time() * 1000)}


@router.get("/settings")
async def public_settings(request: Request):
    return seal(request, settings_store.public_view(await settings_store.load()))


@router.get("/ads")
async def public_ads(request: Request):
    return seal(request, settings_store.ads_view(await settings_store.load()))
