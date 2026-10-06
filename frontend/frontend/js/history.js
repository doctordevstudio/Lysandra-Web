/** Watch history (localStorage). Stores enough of the item to reopen it. */
(function () {
  const KEY = "lysandra.history", MAX = 100;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
  const write = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, MAX))); } catch { try { localStorage.setItem(KEY, JSON.stringify(a.slice(0, 20))); } catch {} } };
  const F = ["kinopoisk_id","title_ru","title_en","poster","description","year","type","duration","ratings","genres","countries","player"];
  window.WatchHistory = {
    all: read,
    add(item) {
      const e = { ts: Date.now() }; F.forEach((k) => { if (item[k] != null) e[k] = item[k]; });
      write([e, ...read().filter((x) => String(x.kinopoisk_id) !== String(item.kinopoisk_id))]);
    },
    clear() { localStorage.removeItem(KEY); },
    remove(id) { write(read().filter((x) => String(x.kinopoisk_id) !== String(id))); },
  };
})();