/**
 * Bootstrap: splash → drawer → carousel → tabs → dialogs.
 * Order matters: splash first, then reveal UI, then show dialogs once.
 */
(function () {
  function setFooterCopy() {
    const el = document.getElementById("footerCopy");
    if (el) el.textContent = window.LYSANDRA_CONFIG.COPYRIGHT;
  }

  function showTopbar() {
    document.getElementById("topbar").classList.add("show");
  }

  /** Branding + links are editable from the admin panel (Settings). */
  async function loadSettings() {
    try {
      const s = await Promise.race([window.API.settings(), new Promise((_, rej) => setTimeout(rej, 2500))]);
      const C = window.LYSANDRA_CONFIG;
      if (s.brand_name) C.BRAND_NAME = s.brand_name;
      if (s.builder) C.BUILDER = s.builder;
      if (s.copyright) C.COPYRIGHT = s.copyright;
      if (s.telegram_join) C.TELEGRAM_JOIN = s.telegram_join;
      if (s.telegram_hire) C.TELEGRAM_HIRE = s.telegram_hire;
      document.title = C.BRAND_NAME;
      document.querySelectorAll(".brand span,.ft-name,.splash-name").forEach((e) => { if (e.children.length === 0) e.textContent = C.BRAND_NAME; });
      document.querySelectorAll(".ft-credit").forEach((e) => (e.textContent = C.BUILDER));
    } catch {}
  }

  async function boot() {
    await loadSettings();
    window.API.trackVisit();
    setFooterCopy();
    document.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => window.Pages.open(b.dataset.page)));
    showTopbar();

    // Init components
    window.Drawer.init();
    window.Movie.init();
    window.Player.init();
    window.Search.init();
    window.Pages.init();

    window.Ads.init();

    // Load remote bits in parallel
    window.Tabs.init();                       // starts the first grid load
    await Promise.race([                      // never keep the splash waiting on a slow carousel
      window.Carousel.load().catch(() => {}),
      new Promise((r) => setTimeout(r, 2500)),
    ]);

    // Hide splash after assets + min delay
    await window.Splash.hide();

    // Show backend-driven dialogs after splash has faded
    window.Dialogs.load();
  }

  // Expose a tiny toast helper
  window.Toast = {
    _t: null,
    show(msg, ms = 2600) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(window.Toast._t);
      window.Toast._t = setTimeout(() => el.classList.remove("show"), ms);
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
