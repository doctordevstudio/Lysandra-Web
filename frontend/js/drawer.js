/**
 * Navigation drawer. Items with icons (inline SVG).
 * On click → routes to page views, external links, or home.
 */
(function () {
  const CFG = window.LYSANDRA_CONFIG;

  const ICONS = {
    home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>`,
    history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>`,
    privacy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z"/></svg>`,
    terms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l4 4v14H4V3z"/><path d="M8 12h8M8 16h6"/></svg>`,
    dmca: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 8h14"/><circle cx="12" cy="12" r="9"/></svg>`,
    support: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-9 9v4a3 3 0 0 0 3 3h2v-6H6v-1a6 6 0 1 1 12 0v1h-2v6h2a3 3 0 0 0 3-3v-4a9 9 0 0 0-9-9Z"/></svg>`,
    dev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/></svg>`,
    telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 2.9 11.6c-1 .4-1 1.8.1 2.1l4.7 1.5 1.8 5.6c.2.7 1.1.9 1.6.3l2.6-2.6 4.8 3.5c.6.4 1.5.1 1.6-.7l2-14.6c.2-1.1-.9-2-1.9-1.4Z"/></svg>`,
  };

  const ITEMS = [
    { id: "home", label: "Home", icon: "home", action: () => window.Pages.close() },
    { id: "history", label: "History", icon: "history", action: () => window.Pages.openHistory() },
    { divider: true },
    { id: "privacy", label: "Privacy Policy", icon: "privacy", page: "privacy" },
    { id: "terms", label: "Terms & Conditions", icon: "terms", page: "terms" },
    { id: "dmca", label: "DMCA", icon: "dmca", page: "dmca" },
    { id: "support", label: "Customer Support", icon: "support", page: "support" },
    { divider: true },
    { id: "dev", label: "About Developer", icon: "dev", page: "about", highlight: true },
    { id: "tg", label: "Join Telegram", icon: "telegram", external: CFG.TELEGRAM_JOIN },
  ];

  function render() {
    const nav = document.getElementById("drawerNav");
    nav.innerHTML = ITEMS.map((it) => {
      if (it.divider) return `<div class="divider"></div>`;
      return `<a class="item ${it.highlight ? "highlight" : ""}" href="javascript:void(0)" data-id="${it.id}">
        ${ICONS[it.icon] || ""}<span>${it.label}</span></a>`;
    }).join("");

    nav.querySelectorAll(".item").forEach((el) => {
      el.addEventListener("click", () => {
        const it = ITEMS.find((x) => x.id === el.dataset.id);
        if (!it) return;
        Drawer.close();
        if (it.action) return it.action();
        if (it.page) return window.Pages.open(it.page);
        if (it.external) window.open(it.external, "_blank", "noopener");
      });
    });

    document.getElementById("drawerFoot").innerHTML = CFG.COPYRIGHT;
  }

  const Drawer = {
    open() {
      document.getElementById("drawer").classList.add("open");
      document.getElementById("drawerBackdrop").classList.add("open");
      document.getElementById("drawer").setAttribute("aria-hidden", "false");
    },
    close() {
      document.getElementById("drawer").classList.remove("open");
      document.getElementById("drawerBackdrop").classList.remove("open");
      document.getElementById("drawer").setAttribute("aria-hidden", "true");
    },
    init() {
      render();
      document.getElementById("btnMenu").addEventListener("click", Drawer.open);
      document.getElementById("drawerBackdrop").addEventListener("click", Drawer.close);
    },
  };

  window.Drawer = Drawer;
})();