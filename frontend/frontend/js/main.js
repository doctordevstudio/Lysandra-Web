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

  async function boot() {
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
    await Promise.allSettled([
      window.Carousel.load(),
      window.Tabs.init(),   // Tabs.init triggers first grid load
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