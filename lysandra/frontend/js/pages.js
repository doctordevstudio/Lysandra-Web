/**
 * Full-screen page viewer for Privacy / Terms / DMCA / Support / About / History.
 * Loads backend HTML from /api/pages/{slug}.
 */
(function () {
  const CFG = window.LYSANDRA_CONFIG;
  const el = () => document.getElementById("pageView");
  const content = () => document.getElementById("pageContent");

  async function renderHistory() {
    const items = window.History.all();
    if (!items.length) {
      content().innerHTML = `<h1>Watch History</h1><p>No history yet. Start watching to build your list.</p>`;
      return;
    }
    content().innerHTML = `
      <h1>Watch History</h1>
      <div class="grid" style="padding:0;">
        ${items
          .map(
            (m) => `
          <div class="card" data-id="${m.kinopoisk_id}" data-poster="${m.poster || ""}" data-title="${m.title || ""}">
            <div class="card-poster">${
              m.poster
                ? `<img loading="lazy" src="${m.poster}" alt="" onerror="this.style.display='none'" />`
                : ""
            }</div>
            <div class="card-meta">
              <div class="card-title">${m.title || ""}</div>
              <div class="card-year">${new Date(m.ts).toLocaleDateString()}</div>
            </div>
          </div>`
          )
          .join("")}
      </div>
      <p style="margin-top:22px"><button class="hire-btn" id="clearHist" style="background:#3B82F6;box-shadow:none;">Clear History</button></p>
    `;
    content().querySelectorAll(".card").forEach((c) => {
      c.addEventListener("click", () => {
        // Reopen detail by fetching this one item from any catalog endpoint
        // Since we only have an id, just attempt a detail lookup later.
        // For now, close history and let the user search.
        Pages.close();
      });
    });
    const clear = document.getElementById("clearHist");
    if (clear) clear.addEventListener("click", () => {
      History.clear();
      renderHistory();
    });
  }

  async function renderAbout() {
    content().innerHTML = `
      <div class="about-hero">
        <img src="${CFG.CLOW_URL}" alt="Dr. Dev || Dr. Hamza" onerror="this.style.display='none'" />
        <h1>Dr. Dev || Dr. Hamza</h1>
        <div class="role">NEET 1st Year Dropper · Full-Stack Developer</div>
        <a class="hire-btn" href="${CFG.TELEGRAM_HIRE}" target="_blank" rel="noopener">Hire Me — $30/hour</a>
        <div class="about-skills">
          <span class="chip">Python</span>
          <span class="chip">PHP</span>
          <span class="chip">Java</span>
          <span class="chip">Kotlin</span>
          <span class="chip">JavaScript</span>
          <span class="chip">Telegram Bots</span>
          <span class="chip">Apps</span>
          <span class="chip">Websites</span>
          <span class="chip">Automation</span>
        </div>
      </div>
      <p>I build Telegram Bots, Apps, Websites, and Automation. Contact me on
      <a href="${CFG.TELEGRAM_HIRE}" target="_blank" rel="noopener">Telegram</a>
      if you want to hire me — <strong>$30/hour</strong>.</p>
    `;
  }

  async function renderTelegramPage() {
    content().innerHTML = `
      <div class="about-hero">
        <img src="${CFG.ICON_URL}" alt="Lysandra" style="border-radius:22px;" />
        <h1>Join Lysandra on Telegram</h1>
        <p style="color:var(--text-dim);text-align:center;max-width:520px;margin-top:10px;">
          Get instant updates, new releases, and support — straight in your pocket.
        </p>
        <a class="hire-btn" href="${CFG.TELEGRAM_JOIN}" target="_blank" rel="noopener">Join Now</a>
      </div>
    `;
  }

  async function renderBackendPage(slug) {
    content().innerHTML = `<div class="loader"></div>`;
    try {
      const data = await window.API.page(slug);
      content().innerHTML = `
        <h1>${data.title || slug}</h1>
        ${data.html || "<p>No content.</p>"}
      `;
      window.API.trackPageview(slug);
    } catch (e) {
      content().innerHTML = `<h1>${slug}</h1><p>Could not load page: ${e.message}</p>`;
    }
  }

  const Pages = {
    async open(slug) {
      el().classList.add("open");
      el().setAttribute("aria-hidden", "false");
      if (slug === "history") return renderHistory();
      if (slug === "about") return renderAbout();
      if (slug === "telegram") return renderTelegramPage();
      return renderBackendPage(slug);
    },
    openHistory() {
      return Pages.open("history");
    },
    close() {
      el().classList.remove("open");
      el().setAttribute("aria-hidden", "true");
    },
    init() {
      // If URL has #page=..., open it
      const m = location.hash.match(/#page=([a-z]+)/);
      if (m) Pages.open(m[1]);
    },
  };

  window.Pages = Pages;
})();