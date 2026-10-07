"""Optional one-time seed (the site works without it: pages & settings have built-in defaults).
    cd backend && python seed.py
Seeds a sample carousel and welcome dialog if those lists are empty."""
import asyncio

from services.defaults import DEFAULT_CAROUSEL, DEFAULT_DIALOGS
from services.firebase import db


async def main():
    if not await db.get("carousel"):
        for item in DEFAULT_CAROUSEL:
            await db.push("carousel", item)
        print("Seeded carousel.")
    if not await db.get("dialogs"):
        for d in DEFAULT_DIALOGS:
            await db.push("dialogs", d)
        print("Seeded dialogs.")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
