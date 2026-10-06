from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field, HttpUrl


# ---------- Carousel ----------
class CarouselIn(BaseModel):
    image_url: str
    onclick_url: str
    sort: int = 0
    enabled: bool = True


class CarouselOut(CarouselIn):
    id: str


# ---------- Dialog ----------
class DialogIn(BaseModel):
    type: Literal["text", "image", "html"] = "text"
    content: str                    # text, image URL, or HTML
    onclick_url: Optional[str] = None
    sort: int = 0
    enabled: bool = True
    # shown once per user session (server tracks via session id + dialog id)


class DialogOut(DialogIn):
    id: str
    total_views: int = 0


# ---------- Page (privacy / terms / dmca / support) ----------
class PageIn(BaseModel):
    slug: str                       # "privacy", "terms", "dmca", "support"
    title: str
    html: str
    enabled: bool = True


class PageOut(PageIn):
    unique_views_today: int = 0
    unique_views_yesterday: int = 0
    unique_views_all: int = 0


# ---------- Analytics ----------
class ClickEvent(BaseModel):
    kind: Literal["carousel", "dialog", "movie", "page"]
    ref_id: str
    session_id: str                 # client-generated UUID per browser session


class WatchEvent(BaseModel):
    kinopoisk_id: int
    title: str
    session_id: str
    source: str                     # 'iframe' | 'm3u8'


# ---------- Admin ----------
class AdminLogin(BaseModel):
    username: str
    password: str
