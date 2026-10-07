/**
 * Splash shown once per visit. If the page reloads within 30 min in the same tab
 * (e.g. coming back from an ad), it is skipped so the user lands straight on the site.
 */
(function () {
  const SPLASH_MIN_MS = 1800, KEY = "lys.splash", WINDOW_MS = 30 * 60 * 1000;
  const started = Date.now();
  let skip = false;
  try {
    const last = +sessionStorage.getItem(KEY) || 0;
    skip = last && started - last < WINDOW_MS;
    sessionStorage.setItem(KEY, String(started));
  } catch {}
  if (skip) document.getElementById("splash")?.remove();

  window.Splash = {
    skipped: skip,
    async hide() {
      const el = document.getElementById("splash");
      if (!el) return;
      const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      el.classList.add("fade-out");
      setTimeout(() => el.remove(), 700);
    },
  };
})();
