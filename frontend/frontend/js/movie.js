/**
 * Movie grid + detail modal + player hookup.
 * Grid uses infinite scroll via IntersectionObserver.
 */
(function () {
  const U = window.U;
  const grid = () => document.getElementById("grid");
  const loader = () => document.getElementById("loader");

  let state = {
    kind: "bollywood",
    page: 1,
    pages: 1,
    loading: false,
    items: [],
    query: null, // set when search is active
  };

  function ratingBadge(item) {
    const r = item?.ratings?.imdb?.rating || item?.ratings?.mlab?.rating || 0;
    if (!r) return "";
    return `<div class="card-rating"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7 7 .5-5.5 4.7 1.8 7L12 17.8 5.7 21.2l1.8-7L2 9.5 9 9z"/></svg>${r.toFixed(1)}</div>`;
  }

  function posterOf(item) {
    return item.poster || "";
  }

  function card(item) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.id = item.kinopoisk_id;
    el.innerHTML = `
      <div class="card-poster">
        ${posterOf(item) ? `<img loading="lazy" src="${U.url(posterOf(item))}" alt="" onerror="this.parentElement.classList.add('skeleton');this.remove()" />` : ""}
        ${ratingBadge(item)}
      </div>
      <div class="card-meta">
        <div class="card-title">${U.esc(item.title_ru || item.title_en || "")}</div>
        <div class="card-year">${U.esc(item.year || "")}${item.type ? " · " + U.esc(item.type) : ""}</div>
      </div>
    `;
    el.addEventListener("click", () => { window.Ads.popunder(); openDetail(item); });
    return el;
  }

  function renderSkeletons(n = 12) {
    const g = grid();
    for (let i = 0; i < n; i++) {
      const sk = document.createElement("div");
      sk.className = "skeleton card-sk";
      g.appendChild(sk);
    }
  }

  function clearSkeletons() {
    grid().querySelectorAll(".card-sk").forEach((el) => el.remove());
  }

  // ---------------- Detail modal ----------------
  const dm = {
    backdrop: () => document.getElementById("modalBackdrop"),
    modal: () => document.getElementById("detailModal"),
  };
  let currentItem = null;

  function openDetail(item) {
    currentItem = item;
    document.getElementById("dmPoster").src = U.url(posterOf(item));
    document.getElementById("dmBg").style.backgroundImage = posterOf(item) ? `url("${U.url(posterOf(item))}")` : "none";
    document.getElementById("dmTitle").textContent =
      item.title_ru || item.title_en || "";
    document.getElementById("dmDesc").textContent = item.description || "No description available.";

    const meta = [];
    if (item.year) meta.push(`<span class="chip">${item.year}</span>`);
    if (item.type) meta.push(`<span class="chip">${U.esc(item.type)}</span>`);
    if (item.duration) meta.push(`<span class="chip">${item.duration} min</span>`);
    const imdb = item?.ratings?.imdb?.rating;
    if (imdb) meta.push(`<span class="chip">⭐ IMDb ${imdb.toFixed(1)}</span>`);
    (item.genres || []).forEach((g) =>
      meta.push(`<span class="chip">${U.esc(g.name)}</span>`)
    );
    (item.countries || []).forEach((c) =>
      meta.push(`<span class="chip">${U.esc(c.name)}</span>`)
    );
    document.getElementById("dmMeta").innerHTML = meta.join("");

    dm.backdrop().classList.add("open");
    dm.modal().classList.add("open"); U.lock(true);

    // Fire a background fetch of the full item if we only have a partial
    // (carousel entries carry only id). This attempts /api/catalog kinds.
    if (!item.title_ru && !item.title_en) hydrate(item.kinopoisk_id);
  }

  function closeDetail() {
    dm.backdrop().classList.remove("open");
    dm.modal().classList.remove("open"); U.lock(false);
  }

  async function hydrate(id) {
    // Try each catalog kind until we find the item. Small payloads; fine.
    for (const kind of ["bollywood", "hollywood", "serials"]) {
      try {
        const res = await window.API.catalog(kind, { page: 1, limit: 50 });
        const found = (res.results || []).find(
          (x) => String(x.kinopoisk_id) === String(id)
        );
        if (found) {
          openDetail(found);
          return;
        }
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
      const res = state.query
        ? await window.API.catalog(state.kind, { page: state.page, limit: 20, title: state.query })
        : await window.API.catalog(state.kind, { page: state.page, limit: 20 });

      if (my !== state) return;
      state.pages = res?.pagination?.pages || 1;
      const items = res?.results || [];
      const g = grid();
      items.forEach((it) => {
        state.items.push(it);
        g.appendChild(card(it));
      });
      if (my.page === 1 && !items.length) g.innerHTML = '<div class="empty">No results found.</div>';
      if (items.length) { g.appendChild(window.Ads.slot()); window.Ads.fill(); }
      state.page += 1;
    } catch (e) {
      window.Toast?.show?.(e.message || "Failed to load.");
    } finally {
      my.loading = false;
      if (my === state) loader().classList.add("hidden");
    }
  }

  function reset(kind, query = null) {
    state = { kind, page: 1, pages: 1, loading: false, items: [], query };
    grid().innerHTML = "";
    renderSkeletons(12);
    loadPage().finally(clearSkeletons);
  }

  function initInfiniteScroll() {
    const sent = document.getElementById("sentinel");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadPage();
      },
      { rootMargin: "400px" }
    );
    io.observe(sent);
  }

  function initModal() {
    document.getElementById("dmClose").addEventListener("click", closeDetail);
    document.getElementById("modalBackdrop").addEventListener("click", closeDetail);
    document.getElementById("dmPlay").addEventListener("click", () => {
      if (!currentItem || !window.Ads.directOnce(currentItem.kinopoisk_id)) return;
      window.Player.open(currentItem);
    });
  }

  async function openSaved(m) {
    const t = m.title_ru || m.title_en || m.title || "";
    if (m.player && m.player.length && t) return openDetail(m);
    window.Toast?.show?.("Loading…");
    for (const kind of ["bollywood", "hollywood", "serials"]) {
      try {
        const r = await window.API.catalog(kind, { page: 1, limit: 20, title: t });
        const f = (r.results || []).find((x) => String(x.kinopoisk_id) === String(m.kinopoisk_id));
        if (f) return openDetail(f);
      } catch {}
    }
    window.Toast?.show?.("Couldn't load this movie. Try searching for it.");
  }

  window.Movie = {
    openSaved,
    openDetail,
    openById: async (id) => {
      // Attempt a fast lookup by hydrating from any catalog that has it
      await hydrate(id);
      if (!document.getElementById("detailModal").classList.contains("open")) window.Toast?.show?.("Movie not found");
    },
    init() {
      initInfiniteScroll();
      initModal();
    },
  };
  window.Grid = { load: (kind) => reset(kind), reload: reset, search: (q) => reset(window.Tabs.current(), q || null) };
})();