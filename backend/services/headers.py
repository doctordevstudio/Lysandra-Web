"""Security headers. The admin page gets a strict CSP; the public site must allow ad networks."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

ADMIN_CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; "
    "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)

# Monetag rotates its script/ad domains, so https: is allowed for scripts on the PUBLIC site only.
PUBLIC_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https:; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: blob: https:; media-src 'self' blob: https:; "
    "frame-src 'self' https:; connect-src 'self' https:; worker-src 'self' blob:; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "geolocation=(), microphone=(), camera=(), payment=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if "text/html" in h.get("content-type", ""):
            h["Content-Security-Policy"] = ADMIN_CSP if request.url.path.startswith("/admin") else PUBLIC_CSP
        return response
