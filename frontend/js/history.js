/** Watch history (localStorage). Stores enough of the item to reopen it. Live TV stream URLs are never stored. */
(function () {
  const KEY = "lysandra.history", MAX = 100;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
  const write = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX))); } catch { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 20))); } catch {} } };
  const F = ["kinopoisk_id", "kind", "title_ru", "title_en", "poster", "description", "year", "type", "duration", "ratings", "genres", "countries", "player"];
  const same = (a, b) => String(a.kinopoisk_id) === String(b.kinopoisk_id) && (a.kind || "") === (b.kind || "");
  window.WatchHistory = {
    all: read,
    add(item) {
      const e = { ts: Date.now() };
      F.forEach((k) => { if (item[k] != null) e[k] = item[k]; });
      if (e.kind === "livetv") delete e.player; // fetched fresh from the server on every play
      write([e, ...read().filter((x) => !same(x, e))]);
    },
    clear() { localStorage.removeItem(KEY); },
    remove(id) { write(read().filter((x) => String(x.kinopoisk_id) !== String(id))); },
  };
})();
