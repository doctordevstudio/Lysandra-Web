/**
 * Movie grid + detail modal + player hookup (also used for Live TV channels).
 * Grid uses infinite scroll via IntersectionObserver; cards are appended in one batch (DocumentFragment).
 */
(function () {
  const U = window.U;
  const grid = () => document.getElementById("grid");
  const loader = () => document.getElementById("loader");
  const KINDS = ["bollywood", "hollywood", "serials"];

  let state = { kind: "bollywood", page: 1, pages: 1, loading: false, items: [], query: null };

  function ratingBadge(item) {
    const r = item?.ratings?.imdb?.rating || item?.ratings?.mlab?.rating || 0;
    if (!r) return "";
    return `<div class="card-rating"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7 7 .5-5.5 4.7 1.8 7L12 17.8 5.7 21.2l1.8-7L2 9.5 9 9z"/></svg>${Number(r).toFixed(1)}</div>`;
  }
  const posterOf = (item) => item.poster || "";
  const titleOf = (item) => item.title_ru || item.title_en || "";

  function card(item) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.id = item.kinopoisk_id;
    const p = posterOf(item);
    el.innerHTML = `
      <div class="card-poster">
        ${p ? `<img loading="lazy" decoding="async" src="${U.url(p)}" alt="" />` : ""}
        ${ratingBadge(item)}
        <span class="card-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>
      </div>
      <div class="card-meta">
        <div class="card-title">${U.esc(titleOf(item))}</div>
        <div class="card-year">${U.esc(item.year || "")}${item.type ? (item.year ? " · " : "") + U.esc(item.type) : ""}</div>
      </div>`;
    const img = el.querySelector("img");
    if (img) img.addEventListener("error", () => { img.parentElement.classList.add("skeleton"); img.remove(); });
    el.addEventListener("click", () => { window.Ads.onMovieClick(); openDetail(item); });
    return el;
  }

  function renderSkeletons(n = 12) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) { const sk = document.createElement("div"); sk.className = "skeleton card-sk"; frag.appendChild(sk); }
    grid().appendChild(frag);
  }
  const clearSkeletons = () => grid().querySelectorAll(".card-sk").forEach((el) => el.remove());

  // ---------------- Detail modal ----------------
  const $ = (id) => document.getElementById(id);
  let currentItem = null;

  function openDetail(item) {
    currentItem = item;
    const live = item.kind === "livetv";
    const poster = U.url(posterOf(item));
    $("dmPoster").src = poster;
    $("dmBg").style.backgroundImage = poster ? `url("${poster}")` : "none";
    $("dmTitle").textContent = titleOf(item);
    $("dmLive").classList.toggle("hidden", !live);
    $("dmPlayText").textContent = live ? "Watch Live" : "Play Now";
    $("dmDesc").textContent = item.description || (live ? "Live channel streaming now." : "No description available.");

    const meta = [];
    if (live) {
      meta.push(`<span class="chip">Live TV</span>`, `<span class="chip">HD</span>`);
      if (item.sources) meta.push(`<span class="chip">${item.sources} source${item.sources === 1 ? "" : "s"}</span>`);
    } else {
      if (item.year) meta.push(`<span class="chip">${U.esc(item.year)}</span>`);
      if (item.type) meta.push(`<span class="chip">${U.esc(item.type)}</span>`);
      if (item.duration) meta.push(`<span class="chip">${U.esc(item.duration)} min</span>`);
      const imdb = item?.ratings?.imdb?.rating;
      if (imdb) meta.push(`<span class="chip">⭐ IMDb ${Number(imdb).toFixed(1)}</span>`);
      (item.genres || []).forEach((g) => meta.push(`<span class="chip">${U.esc(g.name)}</span>`));
      (item.countries || []).forEach((c) => meta.push(`<span class="chip">${U.esc(c.name)}</span>`));
    }
    $("dmMeta").innerHTML = meta.join("");

    $("modalBackdrop").classList.add("open");
    $("detailModal").classList.add("open");
    $("detailModal").scrollTop = 0;
    U.lock(true);

    // Carousel links carry only an id: fetch the full item in the background
    if (!live && !item.title_ru && !item.title_en) hydrate(item.kinopoisk_id);
  }

  function closeDetail() {
    $("modalBackdrop").classList.remove("open");
    $("detailModal").classList.remove("open");
    U.lock(false);
  }

  async function hydrate(id) {
    for (const kind of KINDS) {
      try {
        const res = await window.API.catalog(kind, { page: 1, limit: 50 });
        const found = (res.results || []).find((x) => String(x.kinopoisk_id) === String(id));
        if (found) { found.kind = kind; openDetail(found); return; }
      } catch {}
    }
  }

  // ---------------- Grid loading ----------------
  async function loadPage() {
    if (state.loading || state.page > state.pages) return;
    const my = state;
    state.loading = true;
    loader().classList.remove("hidden");
    try {
      const res = await window.API.catalog(my.kind, { page: my.page, limit: 20, ...(my.query ? { title: my.query } : {}) });
      if (my !== state) return;
      state.pages = res?.pagination?.pages || 1;
      const items = res?.results || [];
      const g = grid();
      clearSkeletons();
      if (my.page === 1 && !items.length) { g.innerHTML = '<div class="empty">No results found.</div>'; }
      else {
        const frag = document.createDocumentFragment();
        items.forEach((it) => { it.kind = my.kind; state.items.push(it); frag.appendChild(card(it)); });
        if (items.length) frag.appendChild(window.Ads.slot());
        g.appendChild(frag);
        if (items.length) window.Ads.fill();
      }
      state.page += 1;
    } catch (e) {
      if (my === state) { clearSkeletons(); window.Toast?.show?.(e.message || "Failed to load."); }
    } finally {
      my.loading = false;
      if (my === state) loader().classList.add("hidden");
    }
  }

  function reset(kind, query = null) {
    state = { kind, page: 1, pages: 1, loading: false, items: [], query };
    grid().textContent = "";
    renderSkeletons(12);
    loadPage();
  }

  /** Called when another section (Live TV) takes over the grid: stops infinite-scroll loading. */
  function stop() {
    state = { kind: "livetv", page: 2, pages: 1, loading: false, items: [], query: null };
    loader().classList.add("hidden");
  }

  function initInfiniteScroll() {
    new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadPage(); }, { rootMargin: "500px" })
      .observe(document.getElementById("sentinel"));
  }

  async function onPlay() {
    const it = currentItem;
    if (!it) return;
    if (!window.Ads.directOnce((it.kind || "m") + "_" + it.kinopoisk_id)) return;
    if (it.kind === "livetv" && !(it.player && it.player.length)) {
      const btn = $("dmPlay");
      btn.disabled = true;
      try { await window.LiveTV.resolve(it); }
      catch (e) { window.Toast?.show?.("Couldn't load this channel. Try again."); return; }
      finally { btn.disabled = false; }
    }
    window.Player.open(it);
  }

  function initModal() {
    $("dmClose").addEventListener("click", closeDetail);
    $("modalBackdrop").addEventListener("click", closeDetail);
    $("dmPlay").addEventListener("click", onPlay);
  }

  async function openSaved(m) {
    if (m.kind === "livetv") return window.LiveTV.openById(m.kinopoisk_id);
    const t = titleOf(m) || m.title || "";
    if (m.player && m.player.length && t) return openDetail(m);
    window.Toast?.show?.("Loading…");
    for (const kind of KINDS) {
      try {
        const r = await window.API.catalog(kind, { page: 1, limit: 20, title: t });
        const f = (r.results || []).find((x) => String(x.kinopoisk_id) === String(m.kinopoisk_id));
        if (f) { f.kind = kind; return openDetail(f); }
      } catch {}
    }
    window.Toast?.show?.("Couldn't load this movie. Try searching for it.");
  }

  window.Movie = {
    openSaved,
    openDetail,
    openById: async (id) => {
      await hydrate(id);
      if (!$("detailModal").classList.contains("open")) window.Toast?.show?.("Movie not found");
    },
    init() { initInfiniteScroll(); initModal(); },
  };
  window.Grid = { load: (kind) => reset(kind), reload: reset, stop, search: (q) => reset(window.Tabs.current(), q || null) };
})();
