/**
 * Stable per-browser session id. Used to deduplicate analytics.
 * Rotates if localStorage is cleared (fine).
 */
(function () {
  const KEY = "lysandra.sid";
  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  let sid = localStorage.getItem(KEY);
  if (!sid) {
    sid = uuid();
    localStorage.setItem(KEY, sid);
  }
  window.Session = { id: () => sid };
})();