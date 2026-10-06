/**
 * Splash shown once per session. Fades after assets + a fixed minimum delay.
 */
(function () {
  const SPLASH_MIN_MS = 1800;
  const started = Date.now();

  window.Splash = {
    async hide() {
      const el = document.getElementById("splash");
      const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      el.classList.add("fade-out");
      // Remove from DOM after transition
      setTimeout(() => el.remove(), 700);
    },
  };
})();