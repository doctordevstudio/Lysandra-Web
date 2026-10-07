# Lysandra backend

**Render start command (repo root):** `cd backend && gunicorn main:app -k uvicorn.workers.UvicornWorker --workers 2 --threads 4 --timeout 120 --bind 0.0.0.0:$PORT`
Repo layout: `backend/` and `frontend/` side by side (the backend serves `../frontend`).

## Env vars
See `.env.example`. Required: `FIREBASE_RTDB_URL`, `FIREBASE_DB_SECRET`, `ADMIN_USERNAME`, one of `ADMIN_PASSWORD_HASH` (`python scripts/hash_password.py 'pw'`) or `ADMIN_PASSWORD`, and `APP_SECRET` (32+ random chars, same on every instance).

## Firebase
Set RTDB rules to deny all client access (`{"rules":{".read":false,".write":false}}`); only this server (via the DB secret) touches the data.

## Notes
- `/api/catalog|carousel|dialogs|pages|ads|settings` responses are AES-GCM encrypted for the site (`ENCRYPT_API=0` disables). Admin API uses bearer sessions over HTTPS.
- Stats days use `STATS_UTC_OFFSET_MIN` (default 330 = India).
- Rate-limit state is per worker process (2 workers ≈ 2x the configured limit).
- Admin edits (ads, branding, links, limits) are in Admin → Settings; no seeding needed.
