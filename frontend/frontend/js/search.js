/**
 * Debounced search. On input, hits catalog with title filter.
 * Also updates the URL with ?title= for shareability.
 */
(function () {
  const DEBOUNCE = 400;
  let t = null;

  function run(q) {
    const params = new URLSearchParams(location.search);
    if (q) params.set("title", q); else params.delete("title");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : ""));
    window.Grid.search(q);
  }

  function init() {
    const input = document.getElementById("searchInput");
    // Prefill from URL
    const urlQ = new URLSearchParams(location.search).get("title");
    if (urlQ) {
      input.value = urlQ;
      setTimeout(() => run(urlQ), 300);
    }
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => run(input.value.trim()), DEBOUNCE);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        clearTimeout(t);
        run(input.value.trim());
        input.blur();
      }
    });
  }

  window.Search = { init };
})();