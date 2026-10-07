/**
 * Lysandra frontend config.
 * Change API_BASE to your Render backend URL before deploying.
 */
window.LYSANDRA_CONFIG = {
  // e.g. "https://lysandra-api.onrender.com"
  API_BASE: "https://lysandraweb.onrender.com",

  // Telegram + contact
  TELEGRAM_JOIN: "https://t.me/lysandraapp",
  TELEGRAM_HIRE: "https://t.me/drdevsupportbot",

  // Assets (local — no external CDN dependency for core UI)
  ICON_URL: "assets/icon-256.png",
  CLOW_URL: "assets/clown-sm.jpg",

  // Used ONLY until the backend serves /api/ads (backend should own these).
  ADS_FALLBACK: {
    vignette:    { zone: "11969115", src: "https://n6wxm.com/vignette.min.js" },
    inpage_push: { zone: "11969112", src: "https://nap5k.com/tag.min.js" },
    push:        { src: "https://5gvci.com/act/files/tag.min.js?z=11969109", cfasync: false },
    popunder:    { zone: "11969100", src: "https://al5sm.com/tag.min.js" },
    direct_link: "https://uplcm.com/4/11969104",
    banner: null // { zone, src } once you create a Monetag banner zone
  },

  // Branding strings
  BRAND_NAME: "Lysandra",
  BUILDER: "Build by Dr. Dev || Dr. Hamza",
  COPYRIGHT:
    "©️ Copyright by Dr. Dev || Dr. Hamza 2026. All rights reserved.",
};
