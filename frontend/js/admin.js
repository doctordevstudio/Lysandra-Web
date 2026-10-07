(() => {
  "use strict";
  const BASE = ((window.LYSANDRA_CONFIG || {}).API_BASE || "").replace(/\/$/, "");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const E = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => E[c]);
  const nf = (n) => Number(n || 0).toLocaleString();
  const when = (ts) => (ts ? new Date(ts * 1000).toLocaleString() : "—");
  const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const TOKEN = "lys.admin.token";
  const Auth = { get: () => localStorage.getItem(TOKEN) || "", set: (t) => localStorage.setItem(TOKEN, t), clear: () => localStorage.removeItem(TOKEN) };

  /* ---------- helpers ---------- */
  let tt;
  function toast(msg, kind = "") {
    const t = $("#toast"); t.textContent = msg; t.className = "toast show " + kind;
    clearTimeout(tt); tt = setTimeout(() => (t.className = "toast"), 3200);
  }
  const errText = (j, status) => {
    const d = j && j.detail;
    if (Array.isArray(d)) return d.map((x) => (x.msg || "").replace(/^Value error, /, "")).join("; ");
    return d || "HTTP " + status;
  };
  async function api(path, { method = "GET", body } = {}) {
    const isLogin = path === "/login";
    let res;
    try {
      res = await fetch(BASE + "/api/admin" + path, {
        method, headers: { "Content-Type": "application/json", ...(Auth.get() && !isLogin ? { Authorization: "Bearer " + Auth.get() } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw new Error("Network error — is the server reachable?"); }
    let j = null; try { j = await res.json(); } catch {}
    if (res.status === 401 && !isLogin) { Auth.clear(); showLogin(); throw new Error("Session expired — please sign in again"); }
    if (!res.ok) throw new Error(errText(j, res.status));
    return j;
  }
  async function fingerprint() {
    try {
      const c = document.createElement("canvas"), x = c.getContext("2d");
      x.font = "14px Arial"; x.fillText("Lysandra", 2, 16);
      const raw = [navigator.userAgent, navigator.language, navigator.platform, screen.width + "x" + screen.height + "x" + screen.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency, c.toDataURL()].join("|");
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch { return ""; }
  }
  function modal(title, html) { $("#mTitle").textContent = title; $("#mBody").innerHTML = html; $("#modal").classList.remove("hidden"); }
  const closeModal = () => { $("#modal").classList.add("hidden"); $("#mBody").innerHTML = ""; };
  const badge = (t, k) => `<span class="badge ${k}">${esc(t)}</span>`;
  const onoff = (b) => (b === false ? badge("Off", "bad") : badge("On", "ok"));
  const skeleton = (n = 4) => `<div class="stats">${"<div class=skel></div>".repeat(n)}</div>`;
  const statBox = (l, v, s = "", c = "") => `<div class="stat ${c}"><div class="l">${esc(l)}</div><div class="v">${nf(v)}</div>${s ? `<div class="s">${esc(s)}</div>` : ""}</div>`;
  const sumSt = (st) => `<div class="kv"><span>Today <b>${nf(st.today)}</b></span><span>Yesterday <b>${nf(st.yesterday)}</b></span><span>All time <b>${nf(st.all)}</b></span></div>`;
  // broken images fall back quietly (CSP forbids inline onerror)
  document.addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.style.visibility = "hidden"; }, true);

  /* ---------- range popup for any metric ---------- */
  function rangeModal(metric, id, label) {
    const t = new Date().toISOString().slice(0, 10);
    modal("Unique count · " + label, `
      <div class="row"><label class="fld"><span>From</span><input type="date" id="rgA" value="${addDays(t, -6)}"></label>
      <label class="fld"><span>To</span><input type="date" id="rgB" value="${t}"></label>
      <button class="btn primary" id="rgGo">Apply</button></div><div id="rgOut" class="stats" style="margin-top:16px"></div>`);
    $("#rgGo").onclick = async () => {
      try { const r = await api(`/metric/range?metric=${metric}&id=${encodeURIComponent(id)}&start=${$("#rgA").value}&end=${$("#rgB").value}`);
        $("#rgOut").innerHTML = statBox("Unique count in range", r.count); } catch (e) { toast(e.message, "err"); }
    };
  }

  /* ---------- VIEW: dashboard ---------- */
  const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  function bars(data, key) {
    const W = 640, H = 190, pad = 26, max = Math.max(1, ...data.map((d) => d[key])), bw = (W - pad * 2) / data.length;
    const b = data.map((d, i) => {
      const h = Math.round(((H - 54) * d[key]) / max), x = pad + i * bw + bw * 0.16, y = H - 24 - h;
      return `<rect x="${x}" y="${y}" width="${bw * 0.68}" height="${Math.max(h, 2)}" rx="5" fill="url(#bg)"/>` +
        `<text class="val" x="${x + bw * 0.34}" y="${y - 6}" text-anchor="middle">${d[key] || ""}</text>` +
        `<text x="${x + bw * 0.34}" y="${H - 8}" text-anchor="middle">${d.day.slice(8)}</text>`;
    }).join("");
    return `<svg class="bars" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c985"/><stop offset="1" stop-color="#c4607c"/></linearGradient></defs>${b}</svg>`;
  }
  async function vDashboard(host) {
    host.innerHTML = skeleton(8);
    const [st, se] = await Promise.all([api("/stats"), api("/stats/series?days=14")]);
    const u = st.users, w = st.watch, T = st.today;
    host.innerHTML = `
      <div class="sec">New users</div><div class="stats">${statBox("Today", u.today)}${statBox("Yesterday", u.yesterday)}${statBox("All time", u.all_time, "since tracking began", "b")}</div>
      <div class="sec">Activity</div><div class="stats">${statBox("Active today", u.active_today, "", "g")}${statBox("Active yesterday", u.active_yesterday, "", "g")}${statBox("Old users active yesterday", u.old_active_yesterday, "returning, not new", "r")}</div>
      <div class="sec">Movie watches</div><div class="stats">${statBox("Today", w.today)}${statBox("Yesterday", w.yesterday)}${statBox("All time", w.all_time, "", "b")}</div>
      <div class="sec">Engagement</div><div class="stats">${statBox("Carousel clicks", st.clicks.carousel_total, "unique users", "r")}${statBox("Dialog views", st.clicks.dialog_total, "unique users", "r")}</div>
      <div class="sec">Date range</div>
      <div class="card"><div class="tabs" id="rt">${[["today", "Today"], ["yesterday", "Yesterday"], ["7", "7 days"], ["30", "30 days"], ["all", "All time"], ["custom", "Custom"]].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join("")}</div><div id="rbox"></div></div>
      <div class="card"><h3>Last 14 days <small id="cm"></small></h3><div class="tabs" id="ct"><button data-m="new_users" class="on">New users</button><button data-m="active">Active</button><button data-m="watch">Watches</button></div><div id="chart"></div></div>`;
    const draw = (m) => { $("#chart").innerHTML = bars(se.results, m); };
    draw("new_users");
    $("#ct").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; $$("#ct button").forEach((x) => x.classList.toggle("on", x === b)); draw(b.dataset.m); };
    const show = (r, note) => ($("#rbox").innerHTML = `<div class="stats">${statBox("New users", r.new_users, note)}${statBox("Active users", r.active_users, note, "g")}${statBox("Movie watches", r.watch_count, note, "b")}</div>`);
    const run = async (a, b, note) => { try { show(await api(`/stats/range?start=${a}&end=${b}`), note); } catch (e) { toast(e.message, "err"); } };
    $("#rt").onclick = (e) => {
      const b = e.target.closest("button"); if (!b) return; $$("#rt button").forEach((x) => x.classList.toggle("on", x === b));
      const k = b.dataset.k;
      if (k === "today") run(T, T, "Today"); else if (k === "yesterday") run(addDays(T, -1), addDays(T, -1), "Yesterday");
      else if (k === "7") run(addDays(T, -6), T, "Last 7 days"); else if (k === "30") run(addDays(T, -29), T, "Last 30 days");
      else if (k === "all") run("2020-01-01", T, "All time");
      else { $("#rbox").innerHTML = `<div class="row"><label class="fld"><span>From</span><input type="date" id="cA" value="${addDays(T, -6)}"></label><label class="fld"><span>To</span><input type="date" id="cB" value="${T}"></label><button class="btn primary" id="cGo">Apply</button></div><div id="cOut" style="margin-top:14px"></div>`;
        $("#cGo").onclick = async () => { try { const r = await api(`/stats/range?start=${$("#cA").value}&end=${$("#cB").value}`); $("#cOut").innerHTML = `<div class="stats">${statBox("New users", r.new_users)}${statBox("Active users", r.active_users, "", "g")}${statBox("Movie watches", r.watch_count, "", "b")}</div>`; } catch (x) { toast(x.message, "err"); } }; }
    };
    $('#rt [data-k="today"]').click();
  }

  /* ---------- VIEW: carousel ---------- */
  async function vCarousel(host) {
    host.innerHTML = skeleton(3);
    const items = (await api("/carousel")).results;
    host.innerHTML = `<div class="head"><p>Home-screen slides. Lower sort number shows first. Clicks count one per user.</p><button class="btn primary" data-act="new">+ Add slide</button></div>` +
      (items.length ? `<div class="cards">${items.map((c) => `<div class="item"><img class="th" src="${esc(c.image_url)}" alt=""><div class="bd">
        <div style="display:flex;gap:8px;align-items:center">${onoff(c.enabled)}${badge("Sort " + (c.sort ?? 0), "info")}</div>
        <div class="url">${esc(c.onclick_url || "No click action")}</div>${sumSt(c.stats)}
        <div class="acts"><button class="btn ghost sm" data-act="edit" data-id="${esc(c.id)}">Edit</button><button class="btn ghost sm" data-act="range" data-id="${esc(c.id)}">Range</button><button class="btn danger sm" data-act="del" data-id="${esc(c.id)}">Delete</button></div></div></div>`).join("")}</div>` : `<div class="card empty">No slides yet.</div>`);
    const form = (c = {}) => {
      modal(c.id ? "Edit slide" : "New slide", `
        <img id="fPrev" class="prev" style="object-fit:cover" src="${esc(c.image_url || "")}" alt="">
        <label class="fld"><span>Image URL</span><input id="fImg" value="${esc(c.image_url || "")}" placeholder="https://…/banner.jpg"></label>
        <label class="fld"><span>On click</span><input id="fUrl" value="${esc(c.onclick_url || "")}" placeholder="/?movie=2295  ·  https://…  ·  #page=support"><small>Opens a movie (/?movie=ID), an external https link, or an in-app page (#page=slug).</small></label>
        <div class="grid2"><label class="fld"><span>Sort order</span><input id="fSort" type="number" min="0" value="${c.sort ?? 0}"></label>
        <label class="switch" style="align-self:end"><input id="fOn" type="checkbox" ${c.enabled === false ? "" : "checked"}> Enabled</label></div>
        <div class="sheet-foot"><button class="btn ghost" id="fCancel">Cancel</button><button class="btn primary" id="fSave">Save</button></div>`);
      $("#fImg").oninput = (e) => { const p = $("#fPrev"); p.style.visibility = "visible"; p.src = e.target.value; };
      $("#fCancel").onclick = closeModal;
      $("#fSave").onclick = async () => {
        const body = { image_url: $("#fImg").value.trim(), onclick_url: $("#fUrl").value.trim(), sort: +$("#fSort").value || 0, enabled: $("#fOn").checked };
        try { await api(c.id ? "/carousel/" + c.id : "/carousel", { method: c.id ? "PUT" : "POST", body }); closeModal(); toast("Saved", "ok"); render(); } catch (e) { toast(e.message, "err"); }
      };
    };
    host.onclick = async (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return; const c = items.find((x) => x.id === b.dataset.id);
      if (b.dataset.act === "new") form(); else if (b.dataset.act === "edit") form(c);
      else if (b.dataset.act === "range") rangeModal("carousel", c.id, "slide clicks");
      else if (b.dataset.act === "del" && confirm("Delete this slide and its stats?")) { try { await api("/carousel/" + c.id, { method: "DELETE" }); toast("Deleted", "ok"); render(); } catch (x) { toast(x.message, "err"); } }
    };
  }

  /* ---------- VIEW: dialogs ---------- */
  const snippet = (d) => d.type === "image" ? `<img src="${esc(d.content)}" alt="" style="height:44px;border-radius:8px">` : esc(String(d.content).replace(/<[^>]*>/g, " ").trim().slice(0, 90));
  async function vDialogs(host) {
    host.innerHTML = skeleton(3);
    const items = (await api("/dialogs")).results;
    host.innerHTML = `<div class="head"><p>Pop-ups shown on site open, one at a time in sort order. Views count one per user.</p><button class="btn primary" data-act="new">+ New dialog</button></div>` +
      (items.length ? `<div class="card"><div class="wrap"><table class="tbl"><thead><tr><th>Sort</th><th>Type</th><th>Content</th><th>Unique views</th><th>Status</th><th></th></tr></thead><tbody>${items.map((d) => `<tr>
        <td>${d.sort ?? 0}</td><td>${badge(d.type, "info")}</td><td>${snippet(d)}</td><td>${sumSt(d.stats)}</td><td>${onoff(d.enabled)}</td>
        <td style="white-space:nowrap"><button class="btn ghost sm" data-act="edit" data-id="${esc(d.id)}">Edit</button> <button class="btn ghost sm" data-act="range" data-id="${esc(d.id)}">Range</button> <button class="btn danger sm" data-act="del" data-id="${esc(d.id)}">Delete</button></td></tr>`).join("")}</tbody></table></div></div>` : `<div class="card empty">No dialogs yet.</div>`);
    const form = (d = {}) => {
      modal(d.id ? "Edit dialog" : "New dialog", `
        <div class="grid2"><label class="fld"><span>Type</span><select id="dType"><option value="text">Text</option><option value="image">Image (URL)</option><option value="html">HTML</option></select></label>
        <label class="fld"><span>Sort order</span><input id="dSort" type="number" min="0" value="${d.sort ?? 0}"></label></div>
        <label class="fld"><span id="dLbl">Content</span><textarea id="dContent">${esc(d.content || "")}</textarea></label>
        <iframe id="dPrev" class="prev" sandbox="" title="Preview"></iframe>
        <label class="fld"><span>On click (optional)</span><input id="dUrl" value="${esc(d.onclick_url || "")}" placeholder="https://… — tapping the dialog opens this"></label>
        <label class="switch"><input id="dOn" type="checkbox" ${d.enabled === false ? "" : "checked"}> Enabled</label>
        <div class="sheet-foot"><button class="btn ghost" id="dCancel">Cancel</button><button class="btn primary" id="dSave">Save</button></div>`);
      $("#dType").value = d.type || "text";
      const pv = () => { const t = $("#dType").value, c = $("#dContent").value; $("#dLbl").textContent = t === "image" ? "Image URL" : t === "html" ? "HTML (scripts are stripped on save)" : "Text";
        const body = t === "image" ? `<img src="${esc(c)}" style="max-width:100%">` : t === "html" ? c : `<p>${esc(c)}</p>`;
        $("#dPrev").srcdoc = `<body style="margin:12px;font:14px sans-serif;color:#222;background:#fff">${body}</body>`; };
      $("#dType").onchange = pv; $("#dContent").oninput = pv; pv();
      $("#dCancel").onclick = closeModal;
      $("#dSave").onclick = async () => {
        const body = { type: $("#dType").value, content: $("#dContent").value, onclick_url: $("#dUrl").value.trim() || null, sort: +$("#dSort").value || 0, enabled: $("#dOn").checked };
        try { await api(d.id ? "/dialogs/" + d.id : "/dialogs", { method: d.id ? "PUT" : "POST", body }); closeModal(); toast("Saved", "ok"); render(); } catch (e) { toast(e.message, "err"); }
      };
    };
    host.onclick = async (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return; const d = items.find((x) => x.id === b.dataset.id);
      if (b.dataset.act === "new") form(); else if (b.dataset.act === "edit") form(d);
      else if (b.dataset.act === "range") rangeModal("dialog", d.id, "dialog views");
      else if (b.dataset.act === "del" && confirm("Delete this dialog?")) { try { await api("/dialogs/" + d.id, { method: "DELETE" }); toast("Deleted", "ok"); render(); } catch (x) { toast(x.message, "err"); } }
    };
  }

  /* ---------- VIEW: pages ---------- */
  async function vPages(host) {
    host.innerHTML = skeleton(3);
    const pages = (await api("/pages")).results;
    host.innerHTML = `<div class="head"><p>Legal & support pages. Unique views count once per user per day.</p></div><div class="cards">${Object.entries(pages).map(([slug, p]) => `<div class="item"><div class="bd">
      <div style="display:flex;gap:8px;align-items:center"><b style="font-size:15px">${esc(p.title.replace(/&amp;/g, "&"))}</b>${onoff(p.enabled)}</div>
      <div class="url">/${esc(slug)}</div><div class="kv"><span>Unique views</span></div>${sumSt(p.views)}
      <div class="acts"><button class="btn ghost sm" data-act="edit" data-id="${slug}">Edit</button><button class="btn ghost sm" data-act="range" data-id="${slug}">Range</button></div></div></div>`).join("")}</div>`;
    host.onclick = (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return; const slug = b.dataset.id, p = pages[slug];
      if (b.dataset.act === "range") return rangeModal("page", slug, p.title.replace(/&amp;/g, "&") + " views");
      modal("Edit · " + slug, `<label class="fld"><span>Title</span><input id="pTitle" value="${esc(p.title)}"></label>
        <label class="fld"><span>HTML content</span><textarea id="pHtml" style="min-height:190px">${esc(p.html)}</textarea></label>
        <iframe id="pPrev" class="prev" sandbox="" title="Preview" style="height:200px"></iframe>
        <label class="switch"><input id="pOn" type="checkbox" ${p.enabled === false ? "" : "checked"}> Enabled</label>
        <div class="sheet-foot"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn primary" id="pSave">Save</button></div>`);
      const pv = () => ($("#pPrev").srcdoc = `<body style="margin:14px;font:14px/1.6 sans-serif;color:#222;background:#fff">${$("#pHtml").value}</body>`);
      $("#pHtml").oninput = pv; pv(); $("#pCancel").onclick = closeModal;
      $("#pSave").onclick = async () => {
        try { await api("/pages/" + slug, { method: "PUT", body: { title: $("#pTitle").value, html: $("#pHtml").value, enabled: $("#pOn").checked } }); closeModal(); toast("Saved", "ok"); render(); } catch (x) { toast(x.message, "err"); }
      };
    };
  }

  /* ---------- VIEW: logs ---------- */
  async function vLogs(host) {
    host.innerHTML = `<div class="tabs" id="lt"><button data-k="admin" class="on">Admin website</button><button data-k="users">User website</button></div><div id="lbody">${skeleton(2)}</div>`;
    const load = async (k) => {
      const box = $("#lbody"); box.innerHTML = skeleton(2);
      try {
        if (k === "admin") {
          const [a, b] = await Promise.all([api("/logs/panel?limit=300"), api("/logs/login?limit=300")]);
          const rows = [...a.results.map((r) => ({ ts: r.ts, ev: badge("Page visit", "info"), ip: r.ip, who: "—", ua: r.ua })),
            ...b.results.map((r) => ({ ts: r.ts, ev: r.success ? badge("Login OK", "ok") : r.result === "blocked" ? badge("Blocked", "warn") : badge("Login failed", "bad"), ip: r.ip, who: esc(r.username), ua: r.ua, dev: r.device }))].sort((x, y) => y.ts - x.ts);
          box.innerHTML = `<div class="card"><h3>Admin website activity <small>${rows.length} events</small></h3><div class="wrap"><table class="tbl"><thead><tr><th>When</th><th>Event</th><th>IP</th><th>User</th><th>Device</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${when(r.ts)}</td><td>${r.ev}</td><td class="mono">${esc(r.ip)}</td><td>${r.who}</td><td class="tiny muted" title="${esc(r.ua)}">${esc((r.ua || "").slice(0, 46))}</td></tr>`).join("") || `<tr><td colspan=5 class=empty>No activity yet</td></tr>`}</tbody></table></div></div>`;
        } else {
          const v = await api("/logs/visits?limit=400");
          box.innerHTML = `<div class="card"><h3>User website visits <small>one row per user per day · ${v.results.length}</small></h3><div class="wrap"><table class="tbl"><thead><tr><th>When</th><th>User</th><th>Type</th><th>IP</th><th>Device</th></tr></thead><tbody>${v.results.map((r) => `<tr><td>${when(r.ts)}</td><td class="mono">${esc(r.session_id)}</td><td>${r.new ? badge("New", "ok") : badge("Returning", "info")}</td><td class="mono">${esc(r.ip)}</td><td class="tiny muted" title="${esc(r.ua)}">${esc((r.ua || "").slice(0, 46))}</td></tr>`).join("") || `<tr><td colspan=5 class=empty>No visits yet</td></tr>`}</tbody></table></div></div>`;
        }
      } catch (e) { box.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
    };
    $("#lt").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; $$("#lt button").forEach((x) => x.classList.toggle("on", x === b)); load(b.dataset.k); };
    load("admin");
  }

  /* ---------- VIEW: settings ---------- */
  const TAGS = [["vignette", "Vignette banner", true], ["inpage_push", "In-page push", true], ["popunder", "Popunder", true], ["banner", "Banner (optional)", true], ["push", "Push notification", false]];
  async function vSettings(host) {
    host.innerHTML = skeleton(4);
    const [s, blocks, sess] = await Promise.all([api("/settings"), api("/blocks"), api("/sessions")]);
    const a = s.ads, L = s.limits, f = (id, l, v, t = "text", h = "") => `<label class="fld"><span>${l}</span><input id="${id}" type="${t}" value="${esc(v ?? "")}">${h ? `<small>${h}</small>` : ""}</label>`;
    host.innerHTML = `
      <div class="card"><h3>Branding & links</h3><div class="grid2">${f("sBrand", "Brand name", s.brand_name)}${f("sBuilder", "Builder credit", s.builder)}</div>
        ${f("sCopy", "Copyright line", s.copyright)}<div class="grid2">${f("sJoin", "Telegram join link", s.telegram_join)}${f("sHire", "Telegram hire link", s.telegram_hire)}</div></div>
      <div class="card"><h3>Ads (Monetag) <small>scripts only load from approved Monetag hosts</small></h3>
        <label class="switch"><input id="aOn" type="checkbox" ${a.enabled ? "checked" : ""}> Ads enabled</label>
        ${TAGS.map(([k, l, z]) => `<div class="sec" style="margin:14px 0 8px">${l}</div><div class="grid2">${z ? f("a_" + k + "_z", "Zone ID", (a[k] || {}).zone) : ""}${f("a_" + k + "_s", "Script URL", (a[k] || {}).src)}</div>`).join("")}
        <div class="sec" style="margin:14px 0 8px">Direct link & service worker</div><div class="grid2">${f("aDirect", "Direct link (opens once per movie on Play)", a.direct_link)}${f("aSw", "Service-worker zone", a.sw_zone, "text", "Blank = use the push zone from the script URL")}</div></div>
      <div class="card"><h3>Rate limits & blocking</h3><div class="grid2">${f("lRpm", "Public requests / minute", L.public_rpm, "number")}${f("lPb", "Public block (minutes)", L.public_block_min, "number")}${f("lFails", "Admin failed logins before block", L.admin_max_fails, "number")}${f("lAb", "Admin block (minutes)", L.admin_block_min, "number")}</div></div>
      <button class="btn primary" id="sSave">Save settings</button>
      <div class="sec">Security</div>
      <div class="card"><h3>Blocked devices <small>${blocks.results.length}</small></h3>${blocks.results.length ? `<div class="wrap"><table class="tbl"><thead><tr><th>Blocked</th><th>Until</th><th>IP</th><th></th></tr></thead><tbody>${blocks.results.map((b) => `<tr><td>${when(b.at)}</td><td>${when(b.until)}</td><td class="mono">${esc(b.ip)}</td><td><button class="btn ghost sm" data-unb="${esc(b.id)}">Unblock</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">No blocked devices</div>`}</div>
      <div class="card"><h3>Admin sessions <small>${sess.results.length} active</small></h3>
        <div class="wrap"><table class="tbl"><thead><tr><th>Signed in</th><th>Expires</th><th>IP</th><th></th></tr></thead><tbody>${sess.results.map((x) => `<tr><td>${when(x.created_at)}</td><td>${when(x.expires_at)}</td><td class="mono">${esc(x.ip)}</td><td>${x.current ? badge("This device", "ok") : ""}</td></tr>`).join("")}</tbody></table></div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn danger" id="revAll">Sign out everywhere</button><button class="btn ghost" id="trim">Delete logs older than 30 days</button></div></div>`;
    $("#sSave").onclick = async () => {
      const tag = (k, z) => ({ src: $("#a_" + k + "_s").value.trim(), ...(z ? { zone: $("#a_" + k + "_z").value.trim() } : {}) });
      const body = { brand_name: $("#sBrand").value, builder: $("#sBuilder").value, copyright: $("#sCopy").value, telegram_join: $("#sJoin").value.trim(), telegram_hire: $("#sHire").value.trim(),
        ads: { enabled: $("#aOn").checked, vignette: tag("vignette", 1), inpage_push: tag("inpage_push", 1), popunder: tag("popunder", 1), banner: tag("banner", 1), push: tag("push", 0), direct_link: $("#aDirect").value.trim(), sw_zone: $("#aSw").value.trim() },
        limits: { public_rpm: +$("#lRpm").value, public_block_min: +$("#lPb").value, admin_max_fails: +$("#lFails").value, admin_block_min: +$("#lAb").value } };
      try { await api("/settings", { method: "PUT", body }); toast("Settings saved — live within ~20s", "ok"); } catch (e) { toast(e.message, "err"); }
    };
    host.onclick = async (e) => {
      const u = e.target.closest("[data-unb]"); if (u) { try { await api("/blocks/" + u.dataset.unb, { method: "DELETE" }); toast("Unblocked", "ok"); render(); } catch (x) { toast(x.message, "err"); } }
    };
    $("#revAll").onclick = async () => { if (!confirm("Sign out all admin sessions, including this one?")) return; try { await api("/sessions/revoke-all", { method: "POST" }); Auth.clear(); showLogin(); } catch (x) { toast(x.message, "err"); } };
    $("#trim").onclick = async () => { if (!confirm("Delete raw logs older than 30 days? Stats totals are kept.")) return; try { const r = await api("/trim?keep_days=30", { method: "POST" }); toast("Removed " + r.removed + " old records", "ok"); } catch (x) { toast(x.message, "err"); } };
  }

  /* ---------- router / shell ---------- */
  const VIEWS = {
    dashboard: ["Dashboard", vDashboard, SVG('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>')],
    carousel: ["Carousel", vCarousel, SVG('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 21h12"/>')],
    dialogs: ["Dialogs", vDialogs, SVG('<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')],
    pages: ["Pages", vPages, SVG('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>')],
    logs: ["Logs", vLogs, SVG('<path d="M4 6h16M4 12h16M4 18h10"/>')],
    settings: ["Settings", vSettings, SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')],
  };
  let seq = 0;
  async function render() {
    const key = (location.hash.replace("#/", "") || "dashboard"), v = VIEWS[key] || VIEWS.dashboard, host = $("#view"), my = ++seq;
    $("#pageTitle").textContent = v[0];
    $$("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.k === (VIEWS[key] ? key : "dashboard")));
    host.onclick = null;
    try { await v[1](host); } catch (e) { if (my === seq && Auth.get()) host.innerHTML = `<div class="card empty">${esc(e.message)}<br><br><button class="btn ghost" id="retry">Retry</button></div>`, ($("#retry").onclick = render); }
  }
  function showLogin() { $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); closeModal(); }
  async function showApp() {
    $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
    $("#nav").innerHTML = Object.entries(VIEWS).map(([k, v]) => `<a href="#/${k}" data-k="${k}">${v[2]}<span>${v[0]}</span></a>`).join("");
    try { $("#who").textContent = (await api("/me")).username; } catch { return; }
    if (!location.hash) location.hash = "#/dashboard"; else render();
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault(); const btn = $("#lgBtn"), err = $("#lgErr"); err.classList.add("hidden"); btn.disabled = true; btn.textContent = "Signing in…";
    try { const r = await api("/login", { method: "POST", body: { username: $("#lgUser").value.trim(), password: $("#lgPass").value, fingerprint: await fingerprint() } }); Auth.set(r.token); $("#lgPass").value = ""; showApp(); }
    catch (x) { err.textContent = x.message; err.classList.remove("hidden"); }
    finally { btn.disabled = false; btn.textContent = "Sign in"; }
  });
  $("#btnLogout").onclick = async () => { try { await api("/logout", { method: "POST" }); } catch {} Auth.clear(); showLogin(); };
  $("#btnRefresh").onclick = render;
  $("#btnMenu").onclick = () => { $("#side").classList.add("open"); $("#scrim").classList.add("show"); };
  const closeSide = () => { $("#side").classList.remove("open"); $("#scrim").classList.remove("show"); };
  $("#scrim").onclick = closeSide; $("#nav").onclick = closeSide;
  $("#mClose").onclick = closeModal;
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  window.addEventListener("hashchange", () => { if (Auth.get()) render(); });
  if (Auth.get()) showApp(); else showLogin();
})();
