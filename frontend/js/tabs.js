/**
 * Bollywood / Hollywood / Series / Live TV tabs. Persists the choice in localStorage.
 */
(function () {
  const KIND_KEY = "lysandra.kind";
  const KINDS = ["bollywood", "hollywood", "serials", "livetv"];
  const LABEL = { bollywood: "Bollywood", hollywood: "Hollywood", serials: "Series", livetv: "Live TV" };
  const SUB = { bollywood: "Latest Hindi movies", hollywood: "Blockbusters in HD", serials: "Binge-worthy series", livetv: "Channels streaming now" };
  const saved = () => { const k = localStorage.getItem(KIND_KEY); return KINDS.includes(k) ? k : "bollywood"; };

  function activate(kind, fromUser) {
    if (!KINDS.includes(kind)) kind = "bollywood";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.kind === kind));
    document.getElementById("sectionTitle").textContent = LABEL[kind];
    const sub = document.getElementById("sectionSub");
    if (sub) sub.textContent = SUB[kind] || "";
    localStorage.setItem(KIND_KEY, kind);
    if (fromUser) { // a new category starts without the previous search
      const input = document.getElementById("searchInput");
      if (input) input.value = "";
      const p = new URLSearchParams(location.search); p.delete("title");
      history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
    }
    if (kind === "livetv") window.LiveTV.load();
    else window.Grid.load(kind);
  }

  function init() {
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => activate(t.dataset.kind, true)));
    activate(saved(), false);
  }

  window.Tabs = { init, activate, current: saved };
})();
