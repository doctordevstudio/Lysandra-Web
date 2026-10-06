/**
 * LYSANDRA ADMIN — single-file SPA
 * Sections:
 *   1. Auth + API client (JWT in memory + sessionStorage)
 *   2. Router (hash-based)
 *   3. Views: Dashboard, Carousel, Dialogs, Pages, Logs, Settings
 *   4. Modal + helpers
 */
(function () {
  const CFG = window.LYSANDRA_CONFIG;
  const TOKEN_KEY = "lysandra.admin.token";

  // ================================================================
  // 1. AUTH + API
  // ================================================================
  const Auth = {
    token: sessionStorage.getItem(TOKEN_KEY) || null,
    set(t) {
      this.token = t;
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    },
    clear() { this.set(null); },
    headers() {
      const h = { "Content-Type": "application/json" };
      if (this.token) h["Authorization"] = "Bearer " + this.token;
      return h;
    },
  };

  async function api(path, opts = {}) {
    const url = CFG.API_BASE.replace(/\/$/, "") + path;
    const res = await fetch(url, {
      ...opts,
      headers: { ...Auth.headers(), ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      Auth.clear();
      showLogin();
      throw new Error("Session expired. Please log in again.");
    }
    if (res.status === 423) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.detail || "Device blocked.");
    }
    if (res.status === 429) {
      const retry = res.headers.get("Retry-After") || "60";
      throw new Error(`Rate limited. Try again in ${retry}s.`);
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j.detail) msg = j.detail; } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  const API = {
    login: (username, password) =>
      api("/api/admin/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    me: () => api("/api/admin/me"),
    stats: () => api("/api/admin/stats"),
    statsRange: (start, end) => api(`/api/admin/stats/range?start=${start}&end=${end}`),

    carouselList: () => api("/api/admin/carousel"),
    carouselCreate: (b) => api("/api/admin/carousel", { method: "POST", body: JSON.stringify(b) }),
    carouselUpdate: (id, b) => api(`/api/admin/carousel/${id}`, { method: "PUT", body: JSON.stringify(b) }),
    carouselDelete: (id) => api(`/api/admin/carousel/${id}`, { method: "DELETE" }),

    dialogsList: () => api("/api/admin/dialogs"),
    dialogCreate: (b) => api("/api/admin/dialogs", { method: "POST", body: JSON.stringify(b) }),
    dialogUpdate: (id, b) => api(`/api/admin/dialogs/${id}`, { method: "PUT", body: JSON.stringify(b) }),
    dialogDelete: (id) => api(`/api/admin/dialogs/${id}`, { method: "DELETE" }),

    pagesList: () => api("/api/admin/pages"),
    pageUpdate: (slug, b) => api(`/api/admin/pages/${slug}`, { method: "PUT", body: JSON.stringify(b) }),

    loginLogs: () => api("/api/admin/logs/login"),
    visitLogs: () => api("/api/admin/logs/visits"),
  };

  // ================================================================
  // 2. HELPERS
  // ================================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDate(ts) {
    if (!ts) return "—";
    const d = ts < 1e12 ? new Date(ts * 1000) : new Date(ts);
    return d.toLocaleString();
  }
  function toast(msg, ms = 2600) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), ms);
  }

  // ---------- Modal ----------
  const Modal = {
    open(title, bodyHTML) {
      $("#amTitle").textContent = title;
      $("#amBody").innerHTML = bodyHTML;
      $("#adminModal").classList.add("open");
    },
    close() {
      $("#adminModal").classList.remove("open");
    },
    body() { return $("#amBody"); },
  };
  document.addEventListener("DOMContentLoaded", () => {
    $("#amClose")?.addEventListener("click", Modal.close);
    $("#adminModal")?.addEventListener("click", (e) => {
      if (e.target.id === "adminModal") Modal.close();
    });
  });

  // ================================================================
  // 3. LOGIN FLOW
  // ================================================================
  function showLogin() {
    $("#loginScreen").classList.remove("hidden");
    $("#adminApp").classList.add("hidden");
    $("#lgPass").value = "";
  }

  function showApp() {
    $("#loginScreen").classList.add("hidden");
    $("#adminApp").classList.remove("hidden");
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $("#lgBtn");
    const err = $("#lgErr");
    err.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      const res = await API.login($("#lgUser").value.trim(), $("#lgPass").value);
      Auth.set(res.token);
      await bootApp();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  }

  // ================================================================
  // 4. ROUTER
  // ================================================================
  const ROUTES = {
    dashboard: { title: "Dashboard", render: viewDashboard },
    carousel:  { title: "Carousel",  render: viewCarousel  },
    dialogs:   { title: "Dialogs",   render: viewDialogs   },
    pages:     { title: "Pages",     render: viewPages     },
    logs:      { title: "Logs",      render: viewLogs      },
    settings:  { title: "Settings",  render: viewSettings  },
  };

  function currentRoute() {
    const h = (location.hash || "#/dashboard").replace(/^#\//, "");
    return ROUTES[h] ? h : "dashboard";
  }

  async function renderRoute() {
    const name = currentRoute();
    $$("#sideNav a").forEach((a) =>
      a.classList.toggle("active", a.dataset.route === name)
    );
    $("#topbarTitle").textContent = ROUTES[name].title;
    const host = $("#adminView");
    host.innerHTML = `<div class="loader"></div>`;
    try {
      await ROUTES[name].render(host);
    } catch (e) {
      host.innerHTML = `<div class="acard"><h2>Error</h2><p>${esc(e.message)}</p></div>`;
    }
    // close mobile sidebar
    $("#adminApp").classList.remove("side-open");
  }

  window.addEventListener("hashchange", renderRoute);

  // ================================================================
  // 5. VIEW: DASHBOARD
  // ================================================================
  async function viewDashboard(host) {
    const [stats, statsYest] = await Promise.all([API.stats(), Promise.resolve(null)]);
    const y = stats.users.yesterday;
    const oldActive = stats.users.all_time - stats.users.today;

    host.innerHTML = `
      <div class="acard">
        <h2><span class="dot"></span>Users</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Today</div>
            <div class="value">${stats.users.today}</div>
            <div class="sub">Unique visitors</div>
          </div>
          <div class="stat blue">
            <div class="label">Yesterday</div>
            <div class="value">${stats.users.yesterday}</div>
            <div class="sub">Unique visitors</div>
          </div>
          <div class="stat pink">
            <div class="label">All Time</div>
            <div class="value">${stats.users.all_time}</div>
            <div class="sub">Unique lifetime</div>
          </div>
          <div class="stat green">
            <div class="label">Old Active</div>
            <div class="value">${Math.max(0, oldActive)}</div>
            <div class="sub">Excludes today</div>
          </div>
        </div>
        <div class="row-tabs" style="margin-top:16px">
          <button data-range="today" class="active">Today</button>
          <button data-range="yesterday">Yesterday</button>
          <button data-range="week">Last 7 days</button>
          <button data-range="all">All time</button>
          <button data-range="custom">Custom…</button>
        </div>
        <div id="dashRangeBox"></div>
      </div>

      <div class="acard">
        <h2><span class="dot"></span>Watch Events</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Today</div>
            <div class="value">${stats.watch.today}</div>
          </div>
          <div class="stat blue">
            <div class="label">Yesterday</div>
            <div class="value">${stats.watch.yesterday}</div>
          </div>
          <div class="stat pink">
            <div class="label">All Time</div>
            <div class="value">${stats.watch.all_time}</div>
          </div>
        </div>
      </div>

      <div class="acard">
        <h2><span class="dot"></span>Clicks</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Carousel Clicks</div>
            <div class="value">${stats.clicks.carousel_total}</div>
            <div class="sub">Unique per session</div>
          </div>
          <div class="stat blue">
            <div class="label">Dialog Clicks</div>
            <div class="value">${stats.clicks.dialog_total}</div>
            <div class="sub">Unique per session</div>
          </div>
        </div>
      </div>
    `;

    $$(".row-tabs button", host).forEach((b) => {
      b.addEventListener("click", async () => {
        $$(".row-tabs button", host).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        const r = b.dataset.range;
        const box = $("#dashRangeBox");
        if (r === "custom") {
          box.innerHTML = `
            <div class="row" style="margin-top:12px">
              <label class="fld"><span>Start</span><input type="date" id="crStart" /></label>
              <label class="fld"><span>End</span><input type="date" id="crEnd" /></label>
              <button class="btn grad" id="crGo">Apply</button>
            </div>
            <div id="crResult"></div>
          `;
          $("#crGo").addEventListener("click", async () => {
            const s = $("#crStart").value, e2 = $("#crEnd").value;
            if (!s || !e2) return toast("Pick both dates");
            try {
              const res = await API.statsRange(s, e2);
              $("#crResult").innerHTML = `
                <div class="stat-grid" style="margin-top:12px">
                  <div class="stat"><div class="label">Unique Users</div><div class="value">${res.unique_users}</div></div>
                  <div class="stat blue"><div class="label">Watch Events</div><div class="value">${res.watch_count}</div></div>
                </div>`;
            } catch (ex) { toast(ex.message); }
          });
        } else {
          box.innerHTML = "";
        }
      });
    });
  }

  // ================================================================
  // 6. VIEW: CAROUSEL
  // ================================================================
  async function viewCarousel(host) {
    const data = await API.carouselList();
    const items = data.results || [];
    host.innerHTML = `
      <div class="acard">
        <h2 style="display:flex;justify-content:space-between;align-items:center;">
          <span><span class="dot"></span>Carousel Items (${items.length})</span>
          <button class="btn grad" id="btnNewCar">+ Add New</button>
        </h2>
        <div class="acar-grid" id="carGrid"></div>
      </div>
    `;
    const grid = $("#carGrid");
    if (!items.length) grid.innerHTML = `<p style="color:var(--text-dim)">No carousel items yet.</p>`;
    items.forEach((it) => {
      const card = document.createElement("div");
      card.className = "acar";
      card.innerHTML = `
        <img src="${esc(it.image_url)}" alt="" onerror="this.style.display='none'" />
        <div class="body">
          <div class="t"><b>Sort:</b> ${esc(it.sort)} · <b>Clicks:</b> ${esc(it.clicks || 0)}</div>
          <div class="t" title="${esc(it.onclick_url)}">${esc(it.onclick_url)}</div>
          <div style="margin-top:8px">
            <span class="badge ${it.enabled ? "on" : "off"}">${it.enabled ? "ENABLED" : "DISABLED"}</span>
          </div>
          <div class="actions">
            <button class="btn ghost sm" data-edit>Edit</button>
            <button class="btn ghost sm" data-toggle>${it.enabled ? "Disable" : "Enable"}</button>
            <button class="btn danger sm" data-del>Delete</button>
          </div>
        </div>
      `;
      card.querySelector("[data-edit]").addEventListener("click", () => openCarouselEditor(it));
      card.querySelector("[data-toggle]").addEventListener("click", async () => {
        try {
          await API.carouselUpdate(it.id, {
            image_url: it.image_url,
            onclick_url: it.onclick_url,
            sort: it.sort,
            enabled: !it.enabled,
          });
          toast("Updated");
          renderRoute();
        } catch (e) { toast(e.message); }
      });
      card.querySelector("[data-del]").addEventListener("click", async () => {
        if (!confirm("Delete this carousel item?")) return;
        try { await API.carouselDelete(it.id); toast("Deleted"); renderRoute(); }
        catch (e) { toast(e.message); }
      });
      grid.appendChild(card);
    });

    $("#btnNewCar").addEventListener("click", () => openCarouselEditor(null));
  }

  function openCarouselEditor(item) {
    const isEdit = !!item;
    Modal.open(isEdit ? "Edit Carousel" : "New Carousel", `
      <label class="fld"><span>Image URL</span><input id="ciImg" type="url" value="${esc(item?.image_url || "")}" required /></label>
      <label class="fld"><span>Onclick URL (e.g. /?movie=2295 or https://...)</span><input id="ciOnc" type="text" value="${esc(item?.onclick_url || "")}" /></label>
      <div class="row">
        <label class="fld"><span>Sort</span><input id="ciSort" type="number" value="${esc(item?.sort ?? 0)}" /></label>
        <label class="fld"><span>Enabled</span>
          <select id="ciEn" class="sel">
            <option value="1" ${item?.enabled !== false ? "selected" : ""}>Yes</option>
            <option value="0" ${item?.enabled === false ? "selected" : ""}>No</option>
          </select>
        </label>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn ghost" id="ciCancel">Cancel</button>
        <button class="btn grad" id="ciSave">Save</button>
      </div>
    `);
    $("#ciCancel").addEventListener("click", Modal.close);
    $("#ciSave").addEventListener("click", async () => {
      const body = {
        image_url: $("#ciImg").value.trim(),
        onclick_url: $("#ciOnc").value.trim(),
        sort: parseInt($("#ciSort").value, 10) || 0,
        enabled: $("#ciEn").value === "1",
      };
      if (!body.image_url) return toast("Image URL required");
      try {
        if (isEdit) await API.carouselUpdate(item.id, body);
        else await API.carouselCreate(body);
        Modal.close();
        toast("Saved");
        renderRoute();
      } catch (e) { toast(e.message); }
    });
  }

  // ================================================================
  // 7. VIEW: DIALOGS
  // ================================================================
  async function viewDialogs(host) {
    const data = await API.dialogsList();
    const items = data.results || [];
    host.innerHTML = `
      <div class="acard">
        <h2 style="display:flex;justify-content:space-between;align-items:center;">
          <span><span class="dot"></span>Dialogs (${items.length})</span>
          <button class="btn grad" id="btnNewDlg">+ Add New</button>
        </h2>
        <table class="tbl">
          <thead>
            <tr><th>Sort</th><th>Type</th><th>Preview</th><th>Views</th><th>Status</th><th></th></tr>
          </thead>
          <tbody id="dlgBody"></tbody>
        </table>
      </div>
    `;
    const tb = $("#dlgBody");
    if (!items.length) tb.innerHTML = `<tr><td colspan="6" style="color:var(--text-dim)">No dialogs yet.</td></tr>`;
    items.forEach((d) => {
      let preview = esc((d.content || "").slice(0, 60));
      if (d.type === "image") preview = `<img src="${esc(d.content)}" style="height:34px;border-radius:6px;" />`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(d.sort)}</td>
        <td><span class="badge type">${esc(d.type || "text")}</span></td>
        <td>${preview}</td>
        <td>${esc(d.total_views || 0)}</td>
        <td><span class="badge ${d.enabled ? "on" : "off"}">${d.enabled ? "ON" : "OFF"}</span></td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="btn ghost sm" data-edit>Edit</button>
          <button class="btn ghost sm" data-toggle>${d.enabled ? "Disable" : "Enable"}</button>
          <button class="btn danger sm" data-del>Delete</button>
        </td>
      `;
      tr.querySelector("[data-edit]").addEventListener("click", () => openDialogEditor(d));
      tr.querySelector("[data-toggle]").addEventListener("click", async () => {
        try {
          await API.dialogUpdate(d.id, {
            type: d.type, content: d.content,
            onclick_url: d.onclick_url || null,
            sort: d.sort, enabled: !d.enabled,
          });
          toast("Updated"); renderRoute();
        } catch (e) { toast(e.message); }
      });
      tr.querySelector("[data-del]").addEventListener("click", async () => {
        if (!confirm("Delete dialog?")) return;
        try { await API.dialogDelete(d.id); toast("Deleted"); renderRoute(); }
        catch (e) { toast(e.message); }
      });
      tb.appendChild(tr);
    });
    $("#btnNewDlg").addEventListener("click", () => openDialogEditor(null));
  }

  function openDialogEditor(d) {
    const isEdit = !!d;
    Modal.open(isEdit ? "Edit Dialog" : "New Dialog", `
      <div class="row">
        <label class="fld"><span>Type</span>
          <select id="diType" class="sel">
            <option value="text" ${d?.type === "text" ? "selected" : ""}>Text</option>
            <option value="image" ${d?.type === "image" ? "selected" : ""}>Image</option>
            <option value="html" ${d?.type === "html" ? "selected" : ""}>HTML</option>
          </select>
        </label>
        <label class="fld"><span>Sort</span><input id="diSort" type="number" value="${esc(d?.sort ?? 0)}" /></label>
        <label class="fld"><span>Enabled</span>
          <select id="diEn" class="sel">
            <option value="1" ${d?.enabled !== false ? "selected" : ""}>Yes</option>
            <option value="0" ${d?.enabled === false ? "selected" : ""}>No</option>
          </select>
        </label>
      </div>
      <label class="fld"><span>Content (text / image URL / HTML)</span>
        <textarea id="diContent" class="txt">${esc(d?.content || "")}</textarea>
      </label>
      <label class="fld"><span>Onclick URL (optional)</span>
        <input id="diOnc" type="text" value="${esc(d?.onclick_url || "")}" />
      </label>
      <div class="dpreview" id="diPrev">Preview…</div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn ghost" id="diCancel">Cancel</button>
        <button class="btn grad" id="diSave">Save</button>
      </div>
    `);
    const preview = () => {
      const t = $("#diType").value;
      const c = $("#diContent").value;
      $("#diPrev").innerHTML =
        t === "image" ? `<img src="${esc(c)}" style="max-width:100%;border-radius:8px;" />` :
        t === "html"  ? c :
        `<p>${esc(c)}</p>`;
    };
    $("#diContent").addEventListener("input", preview);
    $("#diType").addEventListener("change", preview);
    preview();
    $("#diCancel").addEventListener("click", Modal.close);
    $("#diSave").addEventListener("click", async () => {
      const body = {
        type: $("#diType").value,
        content: $("#diContent").value,
        onclick_url: $("#diOnc").value.trim() || null,
        sort: parseInt($("#diSort").value, 10) || 0,
        enabled: $("#diEn").value === "1",
      };
      if (!body.content.trim()) return toast("Content required");
      try {
        if (isEdit) await API.dialogUpdate(d.id, body);
        else await API.dialogCreate(body);
        Modal.close(); toast("Saved"); renderRoute();
      } catch (e) { toast(e.message); }
    });
  }

  // ================================================================
  // 8. VIEW: PAGES
  // ================================================================
  const PAGE_SLUGS = ["privacy", "terms", "dmca", "support", "about"];

  async function viewPages(host) {
    const data = await API.pagesList();
    const pages = data.results || {};
    host.innerHTML = `
      <div class="acard">
        <h2><span class="dot"></span>Static Pages</h2>
        <table class="tbl">
          <thead><tr><th>Slug</th><th>Title</th><th>Status</th><th></th></tr></thead>
          <tbody id="pgBody"></tbody>
        </table>
      </div>
    `;
    const tb = $("#pgBody");
    PAGE_SLUGS.forEach((slug) => {
      const p = pages[slug] || { slug, title: slug, html: "", enabled: true };
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${esc(slug)}</td>
        <td>${esc(p.title || slug)}</td>
        <td><span class="badge ${p.enabled !== false ? "on" : "off"}">${p.enabled !== false ? "ON" : "OFF"}</span></td>
        <td style="text-align:right;"><button class="btn ghost sm" data-edit>Edit</button></td>
      `;
      tr.querySelector("[data-edit]").addEventListener("click", () => openPageEditor(slug, p));
      tb.appendChild(tr);
    });
  }

  function openPageEditor(slug, page) {
    Modal.open(`Edit Page · ${slug}`, `
      <label class="fld"><span>Title</span>
        <input id="pgTitle" type="text" value="${esc(page.title || slug)}" />
      </label>
      <label class="fld"><span>HTML</span>
        <textarea id="pgHtml" class="txt" style="min-height:220px">${esc(page.html || "")}</textarea>
      </label>
      <label class="fld"><span>Enabled</span>
        <select id="pgEn" class="sel">
          <option value="1" ${page.enabled !== false ? "selected" : ""}>Yes</option>
          <option value="0" ${page.enabled === false ? "selected" : ""}>No</option>
        </select>
      </label>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn ghost" id="pgCancel">Cancel</button>
        <button class="btn grad" id="pgSave">Save</button>
      </div>
    `);
    $("#pgCancel").addEventListener("click", Modal.close);
    $("#pgSave").addEventListener("click", async () => {
      const body = {
        slug,
        title: $("#pgTitle").value.trim() || slug,
        html: $("#pgHtml").value,
        enabled: $("#pgEn").value === "1",
      };
      try {
        await API.pageUpdate(slug, body);
        Modal.close(); toast("Saved"); renderRoute();
      } catch (e) { toast(e.message); }
    });
  }

  // ================================================================
  // 9. VIEW: LOGS
  // ================================================================
  async function viewLogs(host) {
    host.innerHTML = `
      <div class="acard">
        <h2><span class="dot"></span>Logs</h2>
        <div class="row-tabs">
          <button data-tab="admin" class="active">Admin Login Attempts</button>
          <button data-tab="visits">User Visits</button>
        </div>
        <div id="logsBox"><div class="loader"></div></div>
      </div>
    `;

    async function loadTab(tab) {
      const box = $("#logsBox");
      box.innerHTML = `<div class="loader"></div>`;
      try {
        if (tab === "admin") {
          const data = await API.loginLogs();
          const rows = data.results || [];
          box.innerHTML = rows.length ? `
            <table class="tbl">
              <thead><tr><th>When</th><th>IP</th><th>Username</th><th>Result</th><th>Fingerprint</th></tr></thead>
              <tbody>${rows.map((r) => `
                <tr>
                  <td>${fmtDate(r.ts)}</td>
                  <td class="mono">${esc(r.ip)}</td>
                  <td>${esc(r.username)}</td>
                  <td class="${r.success ? "ok" : "fail"}">${r.success ? "OK" : "FAIL"}</td>
                  <td class="mono">${esc((r.fingerprint || "").slice(0, 16))}…</td>
                </tr>`).join("")}</tbody>
            </table>` : `<p style="color:var(--text-dim)">No login attempts logged yet.</p>`;
        } else {
          const data = await API.visitLogs();
          const rows = data.results || [];
          box.innerHTML = rows.length ? `
            <table class="tbl">
              <thead><tr><th>When</th><th>IP</th><th>Path</th><th>Session</th></tr></thead>
              <tbody>${rows.map((r) => `
                <tr>
                  <td>${fmtDate(r.ts)}</td>
                  <td class="mono">${esc(r.ip || "")}</td>
                  <td>${esc(r.path || "")}</td>
                  <td class="mono">${esc((r.session_id || "").slice(0, 12))}…</td>
                </tr>`).join("")}</tbody>
            </table>` : `<p style="color:var(--text-dim)">No user visits logged yet. (Wire /api/analytics/pageview to push into admin/visits if you want this filled.)</p>`;
        }
      } catch (e) {
        box.innerHTML = `<p style="color:#FFB3D9">${esc(e.message)}</p>`;
      }
    }

    $$(".row-tabs button", host).forEach((b) => {
      b.addEventListener("click", () => {
        $$(".row-tabs button", host).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        loadTab(b.dataset.tab);
      });
    });
    loadTab("admin");
  }

  // ================================================================
  // 10. VIEW: SETTINGS
  // ================================================================
  async function viewSettings(host) {
    host.innerHTML = `
      <div class="acard">
        <h2><span class="dot"></span>Branding & Links</h2>
        <p style="color:var(--text-dim);font-size:13px;margin:0 0 12px;">
          These are read-only here because they live in the frontend's <code>config.js</code>.
          To change them: edit <code>frontend/config.js</code> and redeploy.
        </p>
        <table class="tbl">
          <tbody>
            <tr><td>Brand</td><td>${esc(CFG.BRAND_NAME)}</td></tr>
            <tr><td>Builder credit</td><td>${esc(CFG.BUILDER)}</td></tr>
            <tr><td>Copyright</td><td>${esc(CFG.COPYRIGHT)}</td></tr>
            <tr><td>Telegram Join</td><td><a href="${esc(CFG.TELEGRAM_JOIN)}" target="_blank" rel="noopener">${esc(CFG.TELEGRAM_JOIN)}</a></td></tr>
            <tr><td>Telegram Hire</td><td><a href="${esc(CFG.TELEGRAM_HIRE)}" target="_blank" rel="noopener">${esc(CFG.TELEGRAM_HIRE)}</a></td></tr>
            <tr><td>API Base</td><td class="mono">${esc(CFG.API_BASE)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="acard">
        <h2><span class="dot"></span>Security</h2>
        <p style="color:var(--text-dim);font-size:13px;margin:0 0 12px;">
          Rate limits, admin block rules, and JWT secret are configured via Render environment variables.
        </p>
        <table class="tbl">
          <tbody>
            <tr><td>PUBLIC_RPM</td><td>Requests per minute per IP (default 100)</td></tr>
            <tr><td>PUBLIC_BLOCK_MIN</td><td>Block minutes after exceeding (default 30)</td></tr>
            <tr><td>ADMIN_MAX_FAILS</td><td>Failed logins before block (default 3)</td></tr>
            <tr><td>ADMIN_BLOCK_MIN</td><td>Admin device block minutes (default 60)</td></tr>
            <tr><td>JWT_SECRET</td><td>HS256 signing secret</td></tr>
          </tbody>
        </table>
      </div>

      <div class="acard">
        <h2><span class="dot"></span>Danger Zone</h2>
        <button class="btn danger" id="btnLogout2">Log out of this session</button>
      </div>
    `;
    $("#btnLogout2").addEventListener("click", logout);
  }

  // ================================================================
  // 11. BOOT / LOGOUT
  // ================================================================
  async function bootApp() {
    // Validate token
    let me;
    try { me = await API.me(); }
    catch { Auth.clear(); return showLogin(); }

    $("#whoami").textContent = "👤 " + me.username;
    showApp();

    if (!location.hash) location.hash = "#/dashboard";
    await renderRoute();
  }

  function logout() {
    Auth.clear();
    showLogin();
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("#loginForm").addEventListener("submit", doLogin);
    $("#btnLogout").addEventListener("click", logout);
    $("#btnSideToggle")?.addEventListener("click", () =>
      $("#adminApp").classList.toggle("side-open")
    );

    // If we already have a token, try to boot
    if (Auth.token) bootApp();
    else showLogin();
  });
})();
