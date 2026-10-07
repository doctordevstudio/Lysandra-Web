from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

ID = r"^[A-Za-z0-9_\-]{1,64}$"
SID = r"^[A-Za-z0-9_\-]{8,64}$"
_HTTP = re.compile(r"^https?://[^\s]+$", re.I)


def _url(v: str, allow_internal: bool = False) -> str:
    v = (v or "").strip()
    if not v:
        return ""
    if _HTTP.match(v):
        return v
    if allow_internal and (re.match(r"^/\?movie=\d{1,12}$", v) or re.match(r"^#page=[a-z]{3,12}$", v)):
        return v
    raise ValueError("Must be an http(s) link" + (", /?movie=ID or #page=slug" if allow_internal else ""))


# ---------- Carousel ----------
class CarouselIn(BaseModel):
    image_url: str = Field(max_length=1000)
    onclick_url: str = Field("", max_length=1000)
    sort: int = Field(0, ge=0, le=100000)
    enabled: bool = True

    @field_validator("image_url")
    @classmethod
    def _img(cls, v):
        v = _url(v)
        if not v:
            raise ValueError("Image URL is required")
        return v

    @field_validator("onclick_url")
    @classmethod
    def _click(cls, v):
        return _url(v, allow_internal=True)


# ---------- Dialog ----------
class DialogIn(BaseModel):
    type: Literal["text", "image", "html"] = "text"
    content: str = Field(min_length=1, max_length=20000)
    onclick_url: Optional[str] = Field(None, max_length=1000)
    sort: int = Field(0, ge=0, le=100000)
    enabled: bool = True

    @field_validator("onclick_url")
    @classmethod
    def _click(cls, v):
        return _url(v or "", allow_internal=True) or None


# ---------- Pages ----------
class PageIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    html: str = Field(max_length=60000)
    enabled: bool = True


# ---------- Analytics ----------
class VisitEvent(BaseModel):
    session_id: str = Field(pattern=SID)


class ClickEvent(BaseModel):
    kind: Literal["carousel", "dialog", "movie", "page"]
    ref_id: str = Field(pattern=ID)
    session_id: str = Field(pattern=SID)


class WatchEvent(BaseModel):
    kinopoisk_id: int = Field(ge=0, le=10**12)
    title: str = Field("", max_length=200)
    session_id: str = Field(pattern=SID)
    source: str = Field("", max_length=20)


class PageviewEvent(BaseModel):
    session_id: str = Field(pattern=SID)


# ---------- Admin ----------
class AdminLogin(BaseModel):
    username: str = Field(max_length=120)
    password: str = Field(max_length=300)
    fingerprint: str = Field("", max_length=128)
