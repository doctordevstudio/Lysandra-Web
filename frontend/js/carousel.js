/** Auto-scrolling carousel: image only, sorted by `sort`, click-tracked. Scrolls away with the page and re-enters with an animation. */
(function () {
  const U = window.U;
  let slides = [], idx = 0, timer = null, dots = null;
  const track = () => document.getElementById("carouselTrack");

  function act(item) {
    const url = (item.onclick_url || "").trim();
    if (!url) return; // no link = no redirect = not a click
    window.API.trackClick("carousel", item.id);
    const m = url.match(/[?&]movie=(\d+)/);
    if (m) return window.Movie.openById(parseInt(m[1], 10));
    if (url.startsWith("#page=")) return window.Pages.open(url.slice(6));
    if (/^https?:/i.test(url)) window.open(url, "_blank", "noopener");
  }
  function go(i, smooth = true) {
    const t = track(), s = slides[i]; if (!s) return;
    idx = i;
    t.scrollTo({ left: s.offsetLeft - (t.clientWidth - s.clientWidth) / 2, behavior: smooth ? "smooth" : "auto" });
    [...dots.children].forEach((d, k) => d.classList.toggle("on", k === i));
  }
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => { stop(); if (slides.length > 1) timer = setInterval(() => !document.hidden && go((idx + 1) % slides.length), 3800); };

  async function load() {
    try {
      const data = await window.API.carousel();
      const items = (data.results || []).filter((x) => x.enabled !== false && U.url(x.image_url)).sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const t = track(); t.innerHTML = "";
      if (!items.length) return document.getElementById("carouselSection").classList.add("hidden");
      dots = document.getElementById("carouselDots"); dots.innerHTML = "";
      slides = items.map((it, i) => {
        const a = document.createElement("div");
        a.className = "carousel-slide"; a.setAttribute("role", "button");
        a.innerHTML = `<img src="${U.url(it.image_url)}" alt="" ${i < 2 ? "" : 'loading="lazy"'} onerror="this.parentElement.remove()" />`;
        a.addEventListener("click", () => act(it));
        t.appendChild(a);
        dots.appendChild(document.createElement("i"));
        return a;
      });
      go(0, false); start();
      ["pointerdown", "touchstart", "mouseenter"].forEach((e) => t.addEventListener(e, stop, { passive: true }));
      ["pointerup", "touchend", "mouseleave"].forEach((e) => t.addEventListener(e, start, { passive: true }));
      let to; t.addEventListener("scroll", () => { clearTimeout(to); to = setTimeout(() => {
        const c = t.scrollLeft + t.clientWidth / 2; let b = 0, d = 1e9;
        slides.forEach((s, i) => { const k = Math.abs(s.offsetLeft + s.clientWidth / 2 - c); if (k < d) { d = k; b = i; } });
        idx = b; [...dots.children].forEach((x, k) => x.classList.toggle("on", k === b));
      }, 90); }, { passive: true });
      const sec = document.getElementById("carouselSection");
      new IntersectionObserver((en) => sec.classList.toggle("in-view", en[0].isIntersecting), { threshold: 0.35 }).observe(sec);
    } catch (e) { console.warn("Carousel load failed:", e); }
  }
  window.Carousel = { load };
})();
