/**
 * Watch history stored in browser localStorage.
 * Shape: [{ kinopoisk_id, title, poster, ts, source }]
 * Capped at 200 entries.
 */
(function () {
  const KEY = "lysandra.history";
  const MAX = 200;

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }
  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
  }

  window.History = {
    all: read,
    add(item) {
      const items = read().filter(
        (x) => String(x.kinopoisk_id) !== String(item.kinopoisk_id)
      );
      items.unshift({ ...item, ts: Date.now() });
      write(items);
    },
    clear() {
      localStorage.removeItem(KEY);
    },
    remove(id) {
      write(read().filter((x) => String(x.kinopoisk_id) !== String(id)));
    },
  };
})();