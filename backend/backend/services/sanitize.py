"""HTML sanitizer for admin-supplied content (pages, dialogs). Strips scripts, handlers, javascript: URLs."""
from __future__ import annotations

import bleach
from bleach.css_sanitizer import CSSSanitizer

ALLOWED_TAGS = [
    "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "small", "sub", "sup", "mark",
    "ul", "ol", "li", "blockquote", "pre", "code", "a", "img",
    "table", "thead", "tbody", "tr", "th", "td", "div", "span", "figure", "figcaption",
]
ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height", "loading"],
    "*": ["class", "style"],
}
CSS = CSSSanitizer(
    allowed_css_properties=[
        "color", "background", "background-color", "font-size", "font-weight", "font-style", "text-align",
        "text-decoration", "margin", "margin-top", "margin-bottom", "padding", "border", "border-radius",
        "width", "max-width", "height", "line-height", "display",
    ]
)


def clean_html(html: str) -> str:
    if not html:
        return ""
    cleaned = bleach.clean(
        html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, protocols=["http", "https", "mailto", "tel"],
        css_sanitizer=CSS, strip=True, strip_comments=True,
    )
    return bleach.linkify(cleaned, callbacks=[bleach.callbacks.nofollow, bleach.callbacks.target_blank])
