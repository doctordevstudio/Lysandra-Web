"""
One-time seed script. Run locally with a .env file:
    cd backend
    python seed.py
Populates default carousel, dialogs, pages so the frontend has
something to render.
"""
import asyncio

from services.firebase import db


DEFAULT_CAROUSEL = [
    {
        "image_url": "https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2295/360339c55650cce4ce7f01af944d7e59.jpg",
        "onclick_url": "/?movie=2295",
        "sort": 1,
        "enabled": True,
        "clicks": 0,
    },
    {
        "image_url": "https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2288/904a41748a67c1b614e162fe4a957d5b.jpg",
        "onclick_url": "/?movie=2288",
        "sort": 2,
        "enabled": True,
        "clicks": 0,
    },
]

DEFAULT_DIALOGS = [
    {
        "type": "html",
        "content": "<h3>Welcome to Lysandra</h3><p>Enjoy unlimited streaming.</p>",
        "onclick_url": None,
        "sort": 1,
        "enabled": True,
        "total_views": 0,
    },
]

DEFAULT_PAGES = {
    "privacy": {
        "slug": "privacy", "title": "Privacy Policy",
        "html": "<p>We respect your privacy.</p>", "enabled": True,
    },
    "terms": {
        "slug": "terms", "title": "Terms & Conditions",
        "html": "<p>Use Lysandra responsibly.</p>", "enabled": True,
    },
    "dmca": {
        "slug": "dmca", "title": "DMCA",
        "html": "<p>Report infringements to dmca@lysandra.app.</p>", "enabled": True,
    },
    "support": {
        "slug": "support", "title": "Customer Support",
        "html": "<p>Contact: t.me/drdevsupportbot</p>", "enabled": True,
    },
    "about": {
        "slug": "about", "title": "About Developer",
        "html": "<p>Dr. Dev || Dr. Hamza</p>", "enabled": True,
    },
}


async def main():
    existing = await db.get("carousel")
    if not existing:
        for item in DEFAULT_CAROUSEL:
            await db.push("carousel", item)
        print("Seeded carousel.")

    existing = await db.get("dialogs")
    if not existing:
        for d in DEFAULT_DIALOGS:
            await db.push("dialogs", d)
        print("Seeded dialogs.")

    existing = await db.get("pages")
    if not existing:
        for slug, page in DEFAULT_PAGES.items():
            await db.set(f"pages/{slug}", page)
        print("Seeded pages.")

    await db.close()


if __name__ == "__main__":
    asyncio.run(main())