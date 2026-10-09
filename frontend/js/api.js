/**
 * API client. Everything goes to OUR backend (the catalog / live-TV sources are never contacted
 * from the browser). Requests and responses are encrypted by secure.js. GET results are cached in
 * memory for a short time and identical in-flight requests are shared, which makes tab switching
 * and back-navigation instant and spares the server.
 */
(function () {
  const CFG = window.LYSANDRA_CONFIG;
  const mem = new Map();      // path -> { exp, data }
  const inflight = new Map(); // path -> Promise

  async function req(path, opts = {}) {
    const url = CFG.API_BASE.replace(/\/$/, "") + path;
    const pathname = new URL(url, location.href).pathname;
    const method = opts.method || "GET";
    const headers = { "Content-Type": "application/json" };
    let body = opts.body;
    if (window.Secure) {
      const k = await window.Secure.key();
      if (k) {
        headers["X-Client-Key"] = k;
        if (method !== "GET" && body !== undefined) body = JSON.stringify(await window.Secure.seal(JSON.parse(body), pathname));
      }
    }
    const res = await fetch(url, { ...opts, method, headers, body });
    if (res.status === 429) throw new Error(`Rate limited. Try again in ${res.headers.get("Retry-After") || "60"}s.`);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j.detail) msg = j.detail; } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    const data = await res.json();
    return res.headers.get("X-Enc") === "1" ? window.Secure.open(data, pathname) : data;
  }

  /** GET with a TTL cache (seconds). */
  function cached(path, ttl) {
    const hit = mem.get(path);
    if (hit && hit.exp > Date.now()) return Promise.resolve(hit.data);
    if (inflight.has(path)) return inflight.get(path);
    const p = req(path).then((data) => {
      mem.set(path, { exp: Date.now() + ttl * 1000, data });
      if (mem.size > 60) mem.delete(mem.keys().next().value);
      return data;
    }).finally(() => inflight.delete(path));
    inflight.set(path, p);
    return p;
  }

  const post = (path, payload) => req(path, { method: "POST", keepalive: true, body: JSON.stringify(payload) });
  const sid = () => window.Session.id();
  const clean = (v, n) => String(v ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, n);

  window.API = {
    catalog: (kind, { page = 1, limit = 20, title } = {}) => {
      const p = new URLSearchParams({ page, limit });
      if (title) p.set("title", title);
      return cached(`/api/catalog/${kind}?${p}`, 60);
    },
    livetvList: () => cached("/api/livetv", 120),
    livetvItem: (id) => req(`/api/livetv/${parseInt(id, 10)}`), // stream URLs: fetched only on Play, never cached
    carousel: () => cached("/api/carousel", 120),
    ads: () => req("/api/ads"),
    settings: () => req("/api/settings"),
    dialogs: () => req("/api/dialogs"),
    page: (slug) => req(`/api/pages/${slug}`),

    trackVisit: () => post("/api/analytics/visit", { session_id: sid() }).catch(() => {}),
    trackClick: (kind, ref_id) => post("/api/analytics/click", { kind, ref_id, session_id: sid() }).catch(() => {}),
    trackWatch: (id, title, source, kind) =>
      post("/api/analytics/watch", {
        kinopoisk_id: clean(id, 64) || "0",
        title: String(title || "").slice(0, 200),
        source: String(source || "").slice(0, 20),
        kind: ["bollywood", "hollywood", "serials", "livetv"].includes(kind) ? kind : "unknown",
        session_id: sid(),
      }).catch((e) => console.warn("Watch tracking failed:", e.message)),
    trackPageview: (slug) => post(`/api/analytics/pageview/${slug}`, { session_id: sid() }).catch(() => {}),
  };
})();
