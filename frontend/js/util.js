(function () {
  const M = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  window.U = {
    esc: (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => M[c]),
    url(u) {
      try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href.replace(/"/g, "%22") : ""; }
      catch { return ""; }
    },
    clean(html) {
      const d = new DOMParser().parseFromString(String(html || ""), "text/html");
      d.querySelectorAll("script,iframe,object,embed,link,meta,base,form").forEach((n) => n.remove());
      d.querySelectorAll("*").forEach((n) => {
        [...n.attributes].forEach((a) => {
          const v = a.value.trim().toLowerCase();
          if (a.name.startsWith("on") || (/^(href|src|action)$/.test(a.name) && v.startsWith("javascript:"))) n.removeAttribute(a.name);
        });
        if (n.tagName === "A") { n.target = "_blank"; n.rel = "noopener noreferrer"; }
      });
      return d.body.innerHTML;
    },
    lock: (on) => { document.body.style.overflow = on ? "hidden" : ""; },
  };
})();