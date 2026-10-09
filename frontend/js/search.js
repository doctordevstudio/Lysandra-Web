/**
 * Debounced search. Movies/series query the catalog (title filter); Live TV filters its channel list locally.
 * Also mirrors the query in the URL (?title=) for sharing.
 */
(function () {
  const DEBOUNCE = 350;
  let t = null;

  function run(q) {
    const params = new URLSearchParams(location.search);
    if (q) params.set("title", q); else params.delete("title");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : ""));
    if (window.Tabs.current() === "livetv") window.LiveTV.search(q);
    else window.Grid.search(q);
  }

  function init() {
    const input = document.getElementById("searchInput");
    const urlQ = new URLSearchParams(location.search).get("title");
    if (urlQ) { input.value = urlQ; setTimeout(() => run(urlQ), 300); }
    input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => run(input.value.trim()), DEBOUNCE); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { clearTimeout(t); run(input.value.trim()); input.blur(); }
    });
  }

  window.Search = { init };
})();
