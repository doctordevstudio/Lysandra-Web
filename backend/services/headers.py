"""
Adds security headers to every response.
CSP is tuned for our specific needs: iframes for playback, images from
any HTTPS host (posters live on many CDNs), inline styles (Tailwind-free
CSS is external, but some inline attributes exist), and HLS.js from jsDelivr.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


CSP = (
    "default-src 'self'; "
    "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com data:; "
    "img-src 'self' data: https:; "
    "media-src 'self' blob: https:; "
    "frame-src 'self' https:; "
    "connect-src 'self' https:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'; "
    "upgrade-insecure-requests"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=()"
        )
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        # Only send CSP for HTML, not for API JSON (saves bytes)
        ct = h.get("content-type", "")
        if "text/html" in ct:
            h["Content-Security-Policy"] = CSP
        return response