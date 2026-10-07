/**
 * Small fetch wrapper. Handles base URL, JSON parsing, error surfacing,
 * and the 429 retry-after case from the backend rate limiter.
 */
(function () {
  const CFG = window.LYSANDRA_CONFIG;

  async function req(path, opts = {}) {
    const url = CFG.API_BASE.replace(/\/$/, "") + path;
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const isGet = !opts.method || opts.method === "GET";
    if (isGet && window.Secure) {
      const k = await window.Secure.key();
      if (k) headers["X-Client-Key"] = k;
    }
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 429) {
      const retry = res.headers.get("Retry-After") || "60";
      throw new Error(`Rate limited. Try again in ${retry}s.`);
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j.detail) msg = j.detail;
      } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    const data = await res.json();
    if (res.headers.get("X-Enc") === "1") return window.Secure.open(data, new URL(url, location.href).pathname);
    return data;
  }

  window.API = {
    catalog: (kind, { page = 1, limit = 20, title } = {}) => {
      const p = new URLSearchParams({ page, limit });
      if (title) p.set("title", title);
      return req(`/api/catalog/${kind}?${p}`);
    },
    carousel: () => req("/api/carousel"),
    ads: () => req("/api/ads"),
    settings: () => req("/api/settings"),
    trackVisit: () =>
      req("/api/analytics/visit", { method: "POST", body: JSON.stringify({ session_id: window.Session.id() }) }).catch(() => {}),
    dialogs: () => req("/api/dialogs"),
    page: (slug) => req(`/api/pages/${slug}`),

    trackClick: (kind, ref_id) =>
      req("/api/analytics/click", {
        method: "POST",
        body: JSON.stringify({
          kind,
          ref_id,
          session_id: window.Session.id(),
        }),
      }).catch(() => {}),

    trackWatch: (kinopoisk_id, title, source) =>
      req("/api/analytics/watch", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          kinopoisk_id: String(kinopoisk_id ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "0",
          title: String(title || "").slice(0, 200),
          source: String(source || "").slice(0, 20),
          session_id: window.Session.id(),
        }),
      }).catch((e) => console.warn("Watch tracking failed:", e.message)),

    trackPageview: (slug) =>
      req(`/api/analytics/pageview/${slug}`, {
        method: "POST",
        body: JSON.stringify({ session_id: window.Session.id() }),
      }).catch(() => {}),
  };
})();
