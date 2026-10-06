"""Centralised config. All secrets come from env vars (Render dashboard)."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # --- Firebase RTDB ---
    FIREBASE_RTDB_URL: str = os.getenv("FIREBASE_RTDB_URL", "").rstrip("/")
    FIREBASE_DB_SECRET: str = os.getenv("FIREBASE_DB_SECRET", "")

    # --- Upstream catalog API ---
    UPSTREAM_BASE: str = os.getenv(
        "UPSTREAM_BASE", "https://mapi.elochkaigolochla.com/api/v1/catalog"
    )
    UPSTREAM_UA: str = os.getenv(
        "UPSTREAM_UA",
        "Mozilla/5.0 (Linux; Android 16; Xiaomi 25040RP0AI) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/114.0.5735.196 Mobile Safari/537.36",
    )

    # --- Admin auth (plaintext password, random session tokens) ---
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")

    # --- CORS ---
    ALLOWED_ORIGINS: list[str] = [
        o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()
    ]

    # --- Rate limits ---
    PUBLIC_RPM: int = int(os.getenv("PUBLIC_RPM", "100"))
    PUBLIC_BLOCK_MIN: int = int(os.getenv("PUBLIC_BLOCK_MIN", "30"))
    ADMIN_MAX_FAILS: int = int(os.getenv("ADMIN_MAX_FAILS", "3"))
    ADMIN_BLOCK_MIN: int = int(os.getenv("ADMIN_BLOCK_MIN", "60"))

    # --- Static frontend ---
    FRONTEND_DIR: str = os.getenv("FRONTEND_DIR", "../frontend")

    @property
    def frontend_path(self) -> Path:
        return Path(__file__).resolve().parent.joinpath(self.FRONTEND_DIR).resolve()


settings = Settings()
