"""Default content used until the admin edits it (no seeding step required)."""

DEFAULT_SETTINGS = {
    "brand_name": "Lysandra",
    "builder": "Build by Dr. Dev || Dr. Hamza",
    "copyright": "©️ Copyright by Dr. Dev || Dr. Hamza 2026. All rights reserved.",
    "telegram_join": "https://t.me/lysandraapp",
    "telegram_hire": "https://t.me/drdevsupportbot",
    "ads": {
        "enabled": True,
        "vignette": {"zone": "11969115", "src": "https://n6wxm.com/vignette.min.js"},
        "inpage_push": {"zone": "11969112", "src": "https://nap5k.com/tag.min.js"},
        "push": {"src": "https://5gvci.com/act/files/tag.min.js?z=11969109", "cfasync": False},
        "popunder": {"zone": "11969100", "src": "https://al5sm.com/tag.min.js"},
        "direct_link": "https://uplcm.com/4/11969104",
        "banner": None,
        "sw_zone": "",
    },
    "limits": {"public_rpm": 100, "public_block_min": 30, "admin_max_fails": 3, "admin_block_min": 60},
}

PAGE_SLUGS = ("privacy", "terms", "dmca", "support", "about")

DEFAULT_PAGES = {
    "privacy": {
        "title": "Privacy Policy",
        "html": (
            "<p>Lysandra respects your privacy. We store a random anonymous ID in your browser to count visits "
            "and keep your watch history on your own device. We do not ask for your name, e-mail or phone number.</p>"
            "<h2>Advertising</h2><p>We show ads served by third-party networks (Monetag). These partners may use "
            "cookies or similar technologies to show relevant ads and measure performance. You can block cookies in "
            "your browser settings.</p><h2>Contact</h2><p>Questions? Reach us through the Customer Support page.</p>"
        ),
    },
    "terms": {
        "title": "Terms & Conditions",
        "html": (
            "<p>By using Lysandra you agree to these terms. The service is provided as is, without warranty. "
            "Content is supplied by third-party sources; we do not host video files. You must not misuse, "
            "scrape or attack the service. We may change or stop the service at any time.</p>"
        ),
    },
    "dmca": {
        "title": "DMCA",
        "html": (
            "<p>Lysandra does not host any media files. If you believe a link infringes your copyright, contact us "
            "through Customer Support with: the exact URL, proof of ownership, and your contact details. "
            "Valid notices are handled promptly.</p>"
        ),
    },
    "support": {
        "title": "Customer Support",
        "html": "<p>Need help? Message us on Telegram: <a href=\"https://t.me/drdevsupportbot\">@drdevsupportbot</a>.</p>",
    },
    "about": {"title": "About Developer", "html": "<p>Dr. Dev || Dr. Hamza</p>"},
}

DEFAULT_CAROUSEL = [
    {"image_url": "https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2295/360339c55650cce4ce7f01af944d7e59.jpg",
     "onclick_url": "/?movie=2295", "sort": 1, "enabled": True, "clicks": 0},
    {"image_url": "https://img.elochkaigolochla.com/340-500/Images/Main/Poster/2288/904a41748a67c1b614e162fe4a957d5b.jpg",
     "onclick_url": "/?movie=2288", "sort": 2, "enabled": True, "clicks": 0},
]

DEFAULT_DIALOGS = [
    {"type": "html", "content": "<h3>Welcome to Lysandra</h3><p>Enjoy unlimited streaming.</p>",
     "onclick_url": None, "sort": 1, "enabled": True, "total_views": 0},
]
