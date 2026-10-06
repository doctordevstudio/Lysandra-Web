/**
 * Full-screen page viewer for Privacy / Terms / DMCA / Support / About / History.
 * Loads backend HTML from /api/pages/{slug}.
 */
(function () {
  const CFG = window.LYSANDRA_CONFIG;
  const el = () => document.getElementById("pageView");
  const content = () => document.getElementById("pageContent");

  async function renderHistory() {
    const U = window.U, items = window.WatchHistory.all();
    if (!items.length) { content().innerHTML = `<h1>Watch History</h1><p>No history yet. Start watching to build your list.</p>`; return; }
    content().innerHTML = `<h1>Watch History</h1><div class="grid" style="padding:0">${items.map((m, i) => `
      <div class="card" data-i="${i}"><div class="card-poster">${m.poster ? `<img loading="lazy" src="${U.url(m.poster)}" alt="" />` : ""}</div>
      <div class="card-meta"><div class="card-title">${U.esc(m.title_ru || m.title_en || "")}</div><div class="card-year">${new Date(m.ts).toLocaleDateString()}</div></div></div>`).join("")}</div>
      <p style="margin-top:22px"><button class="hire-btn" id="clearHist">Clear History</button></p>`;
    content().querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => { const m = items[+c.dataset.i]; Pages.close(); setTimeout(() => window.Movie.openSaved(m), 120); }));
    document.getElementById("clearHist").addEventListener("click", () => { window.WatchHistory.clear(); renderHistory(); });
  }

  async function renderAbout() {
    const svc = [["🤖", "Telegram Bots"], ["📱", "Apps"], ["🌐", "Websites"], ["⚙️", "Automation"]];
    content().innerHTML = `
      <div class="about-card">
        <div class="about-banner"></div>
        <img class="about-avatar" src="${CFG.CLOW_URL}" alt="Dr. Dev || Dr. Hamza" onerror="this.style.display='none'" />
        <div class="about-name">Dr. Dev || Dr. Hamza</div>
        <div class="about-role">NEET 1st Year Dropper · Developer</div>
        <div class="about-stats">
          <div><b>$30</b><span>per hour</span></div>
          <div><b>5</b><span>languages</span></div>
          <div><b>4</b><span>services</span></div>
        </div>
        <div class="about-h">What I build</div>
        <div class="about-build">${svc.map((s) => `<div><i>${s[0]}</i>${s[1]}</div>`).join("")}</div>
        <div class="about-h">Tech I know</div>
        <div class="about-skills">${["Python", "PHP", "Java", "Kotlin", "JavaScript"].map((x) => `<span class="chip">${x}</span>`).join("")}</div>
        <a class="hire-btn about-cta" href="${CFG.TELEGRAM_HIRE}" target="_blank" rel="noopener">Hire Me on Telegram · $30/hour</a>
        <div class="about-note">Want something built? Message <a href="${CFG.TELEGRAM_HIRE}" target="_blank" rel="noopener">@drdevsupportbot</a></div>
      </div>`;
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
        <h1>${window.U.esc(data.title || slug)}</h1>
        ${window.U.clean(data.html || "<p>No content.</p>")}
      `;
      window.API.trackPageview(slug);
    } catch (e) {
      content().innerHTML = `<h1>${slug}</h1><p>Could not load page: ${window.U.esc(e.message)}</p>`;
    }
  }

  const Pages = {
    async open(slug) {
      el().classList.add("open"); window.U.lock(true);
      window.Drawer?.setActive({ about: "dev", telegram: "tg" }[slug] || slug);
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
      el().classList.remove("open"); window.U.lock(false); window.Drawer?.setActive("home");
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