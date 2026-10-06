/**
 * Small fetch wrapper. Handles base URL, JSON parsing, error surfacing,
 * and the 429 retry-after case from the backend rate limiter.
 */
(function () {
  const CFG = window.LYSANDRA_CONFIG;

  async function req(path, opts = {}) {
    const url = CFG.API_BASE.replace(/\/$/, "") + path;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
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
    return res.json();
  }

  window.API = {
    catalog: (kind, { page = 1, limit = 20, title } = {}) => {
      const p = new URLSearchParams({ page, limit });
      if (title) p.set("title", title);
      return req(`/api/catalog/${kind}?${p}`);
    },
    carousel: () => req("/api/carousel"),
    ads: () => req("/api/ads"),
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
        body: JSON.stringify({
          kinopoisk_id,
          title,
          source,
          session_id: window.Session.id(),
        }),
      }).catch(() => {}),

    trackPageview: (slug) =>
      req(`/api/analytics/pageview/${slug}`, {
        method: "POST",
        body: JSON.stringify({ session_id: window.Session.id() }),
      }).catch(() => {}),
  };
})();