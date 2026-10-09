"""Centralised config. Secrets come from env vars (Render dashboard)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


class Settings:
    # --- Firebase RTDB ---
    FIREBASE_RTDB_URL: str = os.getenv("FIREBASE_RTDB_URL", "").rstrip("/")
    FIREBASE_DB_SECRET: str = os.getenv("FIREBASE_DB_SECRET", "")

    # --- Upstream catalog API (primary, then fallback) ---
    UPSTREAM_BASE: str = os.getenv(
        "UPSTREAM_BASE", "https://img.elochkaigolochla.com/api/v1/catalog"
    ).rstrip("/")
    UPSTREAM_FALLBACK: str = os.getenv(
        "UPSTREAM_FALLBACK", "https://mapi.elochkaigolochla.com/api/v1/catalog"
    ).rstrip("/")
    # Live TV ("new-broadcasts") upstream: primary, then fallback. Never sent to the browser.
    LIVETV_URL: str = os.getenv("LIVETV_URL", "https://mapi.elochkaigolochla.com/api/v1/new-broadcasts")
    LIVETV_FALLBACK: str = os.getenv("LIVETV_FALLBACK", "https://img.elochkaigolochla.com/api/v1/new-broadcasts")
    UPSTREAM_UA: str = os.getenv(
        "UPSTREAM_UA",
        "Mozilla/5.0 (Linux; Android 16; Xiaomi 25040RP0AI) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/114.0.5735.196 Mobile Safari/537.36",
    )

    # --- Admin auth ---
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")            # plaintext (fallback)
    ADMIN_PASSWORD_HASH: str = os.getenv("ADMIN_PASSWORD_HASH", "")  # bcrypt (preferred)
    ADMIN_SESSION_HOURS: int = _int("ADMIN_SESSION_HOURS", 12)

    # --- Response encryption ---
    APP_SECRET: str = os.getenv("APP_SECRET", "")
    ENCRYPT_API: bool = os.getenv("ENCRYPT_API", "1") != "0"

    # --- CORS ---
    ALLOWED_ORIGINS: list[str] = [
        o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()
    ]

    # --- Default rate limits (editable at runtime from admin Settings) ---
    PUBLIC_RPM: int = _int("PUBLIC_RPM", 100)
    PUBLIC_BLOCK_MIN: int = _int("PUBLIC_BLOCK_MIN", 30)
    ADMIN_MAX_FAILS: int = _int("ADMIN_MAX_FAILS", 3)
    ADMIN_BLOCK_MIN: int = _int("ADMIN_BLOCK_MIN", 60)

    # --- Stats day boundary: minutes east of UTC (330 = India) ---
    STATS_UTC_OFFSET_MIN: int = _int("STATS_UTC_OFFSET_MIN", 330)

    # --- Extra hosts allowed to serve ad scripts (comma separated) ---
    EXTRA_AD_HOSTS: list[str] = [
        h.strip().lower() for h in os.getenv("EXTRA_AD_HOSTS", "").split(",") if h.strip()
    ]

    # --- Static frontend ---
    FRONTEND_DIR: str = os.getenv("FRONTEND_DIR", "../frontend")

    @property
    def frontend_path(self) -> Path:
        return Path(__file__).resolve().parent.joinpath(self.FRONTEND_DIR).resolve()


settings = Settings()
