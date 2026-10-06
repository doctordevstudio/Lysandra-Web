/**
 * Bollywood / Hollywood / Series tabs.
 * Persists choice in localStorage.
 */
(function () {
  const KIND_KEY = "lysandra.kind";
  const LABEL = {
    bollywood: "Bollywood",
    hollywood: "Hollywood",
    serials: "Series",
  };

  function activate(kind) {
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("active", t.dataset.kind === kind)
    );
    const st = document.getElementById("sectionTitle");
    if (st) st.textContent = LABEL[kind] || kind;
    localStorage.setItem(KIND_KEY, kind);
    window.Grid.load(kind);
  }

  function init() {
    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => activate(t.dataset.kind));
    });
    const saved = localStorage.getItem(KIND_KEY) || "bollywood";
    activate(saved);
  }

  window.Tabs = { init, activate, current: () => localStorage.getItem(KIND_KEY) || "bollywood" };
})();