/** Monetag ads. Config comes from backend /api/ads (falls back to config.js). Scripts only load from allow-listed hosts. */
(function () {
  const ALLOW = ["n6wxm.com", "nap5k.com", "5gvci.com", "al5sm.com", "uplcm.com"];
  const ok = (s) => { try { const u = new URL(s); return u.protocol === "https:" && ALLOW.some((h) => u.hostname === h || u.hostname.endsWith("." + h)); } catch { return false; } };
  const done = {}, last = {};
  let cfg = null;
  const ready = (async () => {
    try { cfg = await window.API.ads(); } catch { cfg = null; }
    if (!cfg || typeof cfg !== "object") cfg = window.LYSANDRA_CONFIG.ADS_FALLBACK || {};
  })();

  /** Appends the ad <script> exactly like Monetag's snippet. `fresh` removes the old one first so the tag runs again. */
  function inject(c, key, host, fresh) {
    if (!c || !c.src || !ok(c.src)) return;
    if (key && done[key] && !fresh) return;
    if (key) {
      done[key] = 1;
      document.querySelectorAll('script[data-lys-ad="' + key + '"]').forEach((n) => n.remove());
    }
    const s = document.createElement("script");
    if (key) s.dataset.lysAd = key;
    if (c.zone) s.dataset.zone = String(c.zone).replace(/\D/g, "");
    if (c.cfasync === false) s.setAttribute("data-cfasync", "false");
    s.src = c.src;
    (host || [document.documentElement, document.body].filter(Boolean).pop()).appendChild(s);
  }
  const throttled = (key, ms) => { const n = Date.now(); if (last[key] && n - last[key] < ms) return false; last[key] = n; return true; };

  window.Ads = {
    async init() {
      await ready;
      // popunder + push must be loaded BEFORE the user's first click so their click listeners are armed
      setTimeout(() => { inject(cfg.popunder, "pop"); inject(cfg.vignette, "vig"); inject(cfg.inpage_push, "inpage"); inject(cfg.push, "push"); }, 700);
      this.fill();
    },
    slot() { const d = document.createElement("div"); d.className = "ad-slot"; return d; },
    fill() { ready.then(() => { if (!cfg.banner) return; document.querySelectorAll(".ad-slot:not([data-f])").forEach((el) => { el.dataset.f = 1; inject(cfg.banner, null, el); }); }); },
    /** Called on every movie card click: shows the vignette and re-arms the popunder. */
    onMovieClick() {
      if (!cfg) return;
      if (throttled("vig", 4000)) inject(cfg.vignette, "vig", null, true);
      if (throttled("pop", 20000)) inject(cfg.popunder, "pop", null, true);
    },
    /** Opens the direct link once per movie; returns true when playback may proceed. */
    directOnce(id) {
      const k = "lys.ad." + id;
      if (sessionStorage.getItem(k) || !cfg || !ok(cfg.direct_link || "")) return true;
      sessionStorage.setItem(k, "1");
      if (!window.open(cfg.direct_link, "_blank", "noopener")) { location.href = cfg.direct_link; return false; }
      window.Toast?.show?.("Sponsor page opened — come back and tap Play again");
      return false;
    },
  };
})();
