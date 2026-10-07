"""Editable site settings (branding, links, ad tags, rate limits) stored at settings/site."""
from __future__ import annotations

import copy
import re
from urllib.parse import parse_qs, urlparse

from config import settings
from services.cache import cache
from services.defaults import DEFAULT_SETTINGS
from services.firebase import db
from services.ratelimit import admin_limiter, public_limiter

BASE_AD_HOSTS = {"n6wxm.com", "nap5k.com", "5gvci.com", "al5sm.com", "uplcm.com"}
AD_TAGS = ("vignette", "inpage_push", "push", "popunder", "banner")


def ad_hosts() -> set[str]:
    return BASE_AD_HOSTS | set(settings.EXTRA_AD_HOSTS)


def host_ok(url: str) -> bool:
    try:
        u = urlparse(url)
        h = (u.hostname or "").lower()
        return u.scheme == "https" and any(h == a or h.endswith("." + a) for a in ad_hosts())
    except Exception:
        return False


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def apply_limits(s: dict) -> None:
    L = s["limits"]
    public_limiter.configure(L["public_rpm"], L["public_block_min"] * 60)
    admin_limiter.block_sec = max(60, L["admin_block_min"] * 60)


async def load(force: bool = False) -> dict:
    if not force:
        hit = cache.get("settings")
        if hit:
            return hit
    try:
        stored = await db.get("settings/site") or {}
    except Exception:
        stored = {}
    s = _merge(DEFAULT_SETTINGS, stored if isinstance(stored, dict) else {})
    apply_limits(s)
    return cache.set("settings", s, 15)


def _text(v, name: str, n: int = 300) -> str:
    v = str(v or "").strip()
    if not v or len(v) > n:
        raise ValueError(f"{name} is required (max {n} chars)")
    return v


def _link(v, name: str) -> str:
    v = _text(v, name)
    if not re.match(r"^https://[^\s]+$", v):
        raise ValueError(f"{name} must be an https:// link")
    return v


def _zone(v) -> str:
    z = re.sub(r"\D", "", str(v or ""))
    if len(z) > 12:
        raise ValueError("zone id too long")
    return z


def _tag(t, name: str, need_zone: bool):
    if not t or not (t.get("src") or "").strip():
        return None
    src = t["src"].strip()
    if not host_ok(src):
        raise ValueError(f"{name}: script host not allowed (allowed: {', '.join(sorted(ad_hosts()))})")
    out = {"src": src}
    zone = _zone(t.get("zone"))
    if need_zone and not zone:
        raise ValueError(f"{name}: zone id required")
    if zone:
        out["zone"] = zone
    if t.get("cfasync") is False:
        out["cfasync"] = False
    return out


def validate(data: dict) -> dict:
    cur = copy.deepcopy(DEFAULT_SETTINGS)
    out = {
        "brand_name": _text(data.get("brand_name"), "Brand name", 40),
        "builder": _text(data.get("builder"), "Builder credit", 120),
        "copyright": _text(data.get("copyright"), "Copyright", 200),
        "telegram_join": _link(data.get("telegram_join"), "Telegram join link"),
        "telegram_hire": _link(data.get("telegram_hire"), "Telegram hire link"),
    }
    a = data.get("ads") or {}
    ads = {"enabled": bool(a.get("enabled", True)), "banner": None}
    ads["vignette"] = _tag(a.get("vignette"), "Vignette", True)
    ads["inpage_push"] = _tag(a.get("inpage_push"), "In-page push", True)
    ads["popunder"] = _tag(a.get("popunder"), "Popunder", True)
    push = _tag(a.get("push"), "Push notification", False)
    if push:
        push["cfasync"] = False
    ads["push"] = push
    ads["banner"] = _tag(a.get("banner"), "Banner", True)
    dl = (a.get("direct_link") or "").strip()
    if dl and not host_ok(dl):
        raise ValueError("Direct link host not allowed")
    ads["direct_link"] = dl
    ads["sw_zone"] = _zone(a.get("sw_zone"))
    out["ads"] = ads
    L = data.get("limits") or {}

    def num(k, lo, hi):
        try:
            v = int(L.get(k, cur["limits"][k]))
        except (TypeError, ValueError):
            raise ValueError(f"{k} must be a number")
        if not lo <= v <= hi:
            raise ValueError(f"{k} must be between {lo} and {hi}")
        return v

    out["limits"] = {
        "public_rpm": num("public_rpm", 10, 5000),
        "public_block_min": num("public_block_min", 1, 1440),
        "admin_max_fails": num("admin_max_fails", 1, 20),
        "admin_block_min": num("admin_block_min", 1, 10080),
    }
    return out


async def save(data: dict) -> dict:
    clean = validate(data)
    await db.set("settings/site", clean)
    cache.drop("settings")
    return await load(force=True)


def public_view(s: dict) -> dict:
    return {k: s[k] for k in ("brand_name", "builder", "copyright", "telegram_join", "telegram_hire")}


def ads_view(s: dict) -> dict:
    a = s["ads"]
    if not a.get("enabled"):
        return {}
    return {k: a[k] for k in ("vignette", "inpage_push", "push", "popunder", "banner", "direct_link") if a.get(k)}


def sw_zone(s: dict) -> str:
    a = s["ads"]
    if a.get("sw_zone"):
        return a["sw_zone"]
    push = (a.get("push") or {}).get("src", "")
    q = parse_qs(urlparse(push).query).get("z", [""])[0]
    return re.sub(r"\D", "", q)
