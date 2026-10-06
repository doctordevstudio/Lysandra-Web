/**
 * Backend-driven dialogs, shown in sort order after splash ends.
 * Rules:
 *  - One dialog at a time; dismiss reveals the next.
 *  - Once dismissed by a user in this browser session (sessionStorage), don't show again.
 *  - If user navigates away to a page (DMCA, etc.) and comes back, dialogs do NOT reshow.
 */
(function () {
  const SEEN_KEY = "lysandra.dialog_seen"; // sessionStorage (per tab-session)
  const layer = () => document.getElementById("dialogLayer");

  function seenSet() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]")); }
    catch { return new Set(); }
  }
  function markSeen(id) {
    const s = seenSet(); s.add(String(id));
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  }

  function build(dialog) {
    const box = document.createElement("div");
    box.className = "dialog-box";
    const title = dialog.title || "Lysandra";
    let body = "";
    if (dialog.type === "image") {
      body = `<img src="${dialog.content}" alt="" style="max-width:100%;" />`;
    } else if (dialog.type === "html") {
      body = dialog.content;
    } else {
      body = `<p>${dialog.content}</p>`;
    }
    const hasUrl = dialog.onclick_url && dialog.onclick_url.trim();
    box.innerHTML = `
      <div class="dialog-head">
        <div class="title">${title}</div>
        <button class="icon-btn" data-close aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="dialog-body">${body}</div>
      <div class="dialog-foot">
        ${hasUrl ? `<button class="hire-btn" style="background:var(--grad-cool);box-shadow:none;" data-goto>Open</button>` : ""}
        <button class="hire-btn" data-close>Close</button>
      </div>
    `;
    layer().appendChild(box);
    requestAnimationFrame(() => box.classList.add("open"));

    function destroy(countView = true) {
      box.classList.remove("open");
      if (countView) {
        window.API.trackClick("dialog", dialog.id);
        markSeen(dialog.id);
      }
      setTimeout(() => box.remove(), 260);
    }

    box.querySelectorAll("[data-close]").forEach((b) =>
      b.addEventListener("click", () => destroy())
    );
    const go = box.querySelector("[data-goto]");
    if (go)
      go.addEventListener("click", () => {
        window.open(dialog.onclick_url, "_blank", "noopener");
        destroy();
      });

    return { destroy };
  }

  let queue = [];
  let showing = false;

  async function pump() {
    if (showing) return;
    const next = queue.shift();
    if (!next) return;
    showing = true;
    const { destroy } = build(next);
    // Wait until destroyed before showing the next
    const t = setInterval(() => {
      if (!document.body.contains(document.querySelector(".dialog-box"))) {
        clearInterval(t);
        showing = false;
        pump();
      }
    }, 200);
  }

  async function load() {
    try {
      const data = await window.API.dialogs();
      const seen = seenSet();
      queue = (data.results || [])
        .filter((d) => !seen.has(String(d.id)))
        .sort((a, b) => (a.sort || 0) - (b.sort || 0));
      pump();
    } catch {}
  }

  window.Dialogs = { load };
})();