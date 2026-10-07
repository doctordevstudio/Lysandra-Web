/** Monetag ads. Config comes from backend /api/ads (falls back to config.js). Scripts only load from allow-listed hosts. */
(function () {
  const ALLOW = ["n6wxm.com", "nap5k.com", "5gvci.com", "al5sm.com", "uplcm.com"];
  const ok = (s) => { try { const u = new URL(s); return u.protocol === "https:" && ALLOW.some((h) => u.hostname === h || u.hostname.endsWith("." + h)); } catch { return false; } };
  const done = {};
  let cfg = null;
  const ready = (async () => {
    try { cfg = await window.API.ads(); } catch { cfg = null; }
    if (!cfg || typeof cfg !== "object") cfg = window.LYSANDRA_CONFIG.ADS_FALLBACK || {};
  })();

  function inject(c, key, host) {
    if (!c || !c.src || !ok(c.src) || (key && done[key])) return;
    if (key) done[key] = 1;
    const s = document.createElement("script");
    s.src = c.src; s.async = true;
    if (c.zone) s.dataset.zone = String(c.zone).replace(/\D/g, "");
    if (c.cfasync === false) s.setAttribute("data-cfasync", "false");
    (host || document.body).appendChild(s);
  }

  window.Ads = {
    async init() { await ready; setTimeout(() => { inject(cfg.vignette, "vig"); inject(cfg.inpage_push, "inpage"); inject(cfg.push, "push"); }, 1200); this.fill(); },
    slot() { const d = document.createElement("div"); d.className = "ad-slot"; return d; },
    fill() { ready.then(() => { if (!cfg.banner) return; document.querySelectorAll(".ad-slot:not([data-f])").forEach((el) => { el.dataset.f = 1; inject(cfg.banner, null, el); }); }); },
    async popunder() { await ready; inject(cfg.popunder, "pop"); },
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