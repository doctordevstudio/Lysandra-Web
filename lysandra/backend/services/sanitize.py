"""
HTML sanitizer for admin-supplied content.
Uses bleach. Strips <script>, event handlers, javascript: URLs, iframes
(unless explicitly whitelisted — we do NOT whitelist them here; the
player iframes are created by the frontend, not stored as user HTML).
"""
from __future__ import annotations

import bleach

ALLOWED_TAGS = [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "div", "span",
    "figure", "figcaption",
]

ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height", "loading"],
    "*": ["class", "id", "style"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto", "tel"]


def clean_html(html: str) -> str:
    """
    Sanitize admin HTML. Forces every <a> to open safely.
    """
    if not html:
        return ""
    cleaned = bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )
    # Force safe link attributes
    cleaned = bleach.linkify(
        cleaned,
        callbacks=[
            bleach.callbacks.nofollow,
            bleach.callbacks.target_blank,
        ],
    )
    return cleaned