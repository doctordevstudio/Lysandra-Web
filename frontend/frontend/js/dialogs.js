/** Backend dialogs: sorted, one at a time, no close button (tap outside / swipe down / Esc). Shown once per page load, so in-app navigation never re-triggers them. */
(function () {
  const U = window.U, seen = new Set();
  let started = false;
  const layer = () => document.getElementById("dialogLayer");

  function show(d) {
    return new Promise((res) => {
      const back = document.createElement("div"); back.className = "dlg-back";
      const box = document.createElement("div"); box.className = "dialog-box";
      const url = (d.onclick_url || "").trim();
      const body = d.type === "image" ? `<img src="${U.url(d.content)}" alt="" />` : d.type === "html" ? U.clean(d.content) : `<p>${U.esc(d.content)}</p>`;
      box.innerHTML = `<button class="dlg-x" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button><div class="dialog-body">${body}</div>`;
      if (/^https?:/i.test(url)) box.classList.add("clickable");
      layer().append(back, box);
      requestAnimationFrame(() => { back.classList.add("open"); box.classList.add("open"); });
      window.API.trackClick("dialog", d.id);
      let closed = false, y0 = null;
      const close = () => {
        if (closed) return; closed = true; seen.add(String(d.id));
        document.removeEventListener("keydown", esc);
        back.classList.remove("open"); box.classList.remove("open");
        setTimeout(() => { back.remove(); box.remove(); res(); }, 260);
      };
      const esc = (e) => e.key === "Escape" && close();
      document.addEventListener("keydown", esc);
      back.addEventListener("click", close);
      box.querySelector(".dlg-x").addEventListener("click", (e) => { e.stopPropagation(); close(); });
      box.addEventListener("click", (e) => { if (box.classList.contains("clickable") && !e.target.closest("a,.dlg-x")) { window.open(url, "_blank", "noopener"); close(); } });
      box.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
      box.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) close(); y0 = null; }, { passive: true });
    });
  }

  async function load() {
    if (started) return; started = true;
    try {
      const data = await window.API.dialogs();
      const q = (data.results || []).filter((d) => d.enabled !== false && !seen.has(String(d.id))).sort((a, b) => (a.sort || 0) - (b.sort || 0));
      for (const d of q) await show(d);
    } catch {}
  }
  window.Dialogs = { load };
})();