/**
 * Live TV. Channel list comes from OUR backend (/api/livetv) — it contains no stream URLs.
 * A channel's sources are requested from the server only when the user presses Play.
 */
(function () {
  const U = window.U;
  const grid = () => document.getElementById("grid");
  let list = null, loadedAt = 0, query = "";

  const toItem = (c) => ({
    kinopoisk_id: c.id, kind: "livetv", type: "Live TV", title_ru: c.title, title_en: "",
    description: c.description, poster: c.poster, player: null, sources: c.count,
  });

  function card(c) {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div class="card-poster">
        ${c.poster ? `<img loading="lazy" decoding="async" src="${U.url(c.poster)}" alt="" />` : ""}
        <span class="live-pill"><i></i>LIVE</span>
        <span class="card-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
      </div>
      <div class="card-meta">
        <div class="card-title">${U.esc(c.title)}</div>
        <div class="card-year">${c.count} source${c.count === 1 ? "" : "s"} · HD</div>
      </div>`;
    const img = el.querySelector("img");
    if (img) img.addEventListener("error", () => img.remove());
    el.addEventListener("click", () => { window.Ads.onMovieClick(); window.Movie.openDetail(toItem(c)); });
    return el;
  }

  function render() {
    const q = query.toLowerCase();
    const rows = (list || []).filter((c) => !q || c.title.toLowerCase().includes(q));
    const g = grid();
    g.textContent = "";
    if (!rows.length) { g.innerHTML = `<div class="empty">${q ? "No channels match your search." : "No channels available right now."}</div>`; return; }
    const frag = document.createDocumentFragment();
    rows.forEach((c) => frag.appendChild(card(c)));
    g.appendChild(frag);
    const sub = document.getElementById("sectionSub");
    if (sub && window.Tabs.current() === "livetv") sub.textContent = `${rows.length} channel${rows.length === 1 ? "" : "s"} streaming now`;
  }

  async function load() {
    window.Grid.stop();
    const g = grid();
    if (!list || Date.now() - loadedAt > 120000) {
      g.textContent = "";
      for (let i = 0; i < 12; i++) { const sk = document.createElement("div"); sk.className = "skeleton card-sk"; g.appendChild(sk); }
      try {
        list = (await window.API.livetvList()).results || [];
        loadedAt = Date.now();
      } catch (e) {
        if (window.Tabs.current() !== "livetv") return;
        g.innerHTML = `<div class="empty">Live TV is unavailable right now. Please try again shortly.</div>`;
        return window.Toast?.show?.(e.message || "Live TV failed to load");
      }
    }
    if (window.Tabs.current() === "livetv") render();
  }

  function search(q) { query = q || ""; if (list) render(); else load(); }

  /** Adds the playable sources (server call) to a channel item. */
  async function resolve(item) {
    if (item.player && item.player.length) return item;
    const d = await window.API.livetvItem(item.kinopoisk_id);
    item.player = d.players || [];
    return item;
  }

  async function openById(id) {
    try {
      if (!list) list = (await window.API.livetvList()).results || [];
      const c = list.find((x) => String(x.id) === String(id));
      if (!c) return window.Toast?.show?.("This channel is no longer available");
      window.Movie.openDetail(toItem(c));
    } catch (e) { window.Toast?.show?.(e.message || "Couldn't load Live TV"); }
  }

  window.LiveTV = { load, search, resolve, openById };
})();
