/**
 * Auto-scrolling carousel with:
 *  - sticky-on-scroll-up behaviour (like YouTube)
 *  - pauses on hover/touch
 *  - click tracking (unique per session, backend dedupes)
 */
(function () {
  const track = () => document.getElementById("carouselTrack");
  const section = () => document.getElementById("carouselSection");
  let autoTimer = null;
  let items = [];

  function slide(item) {
    const a = document.createElement("a");
    a.className = "carousel-slide";
    a.href = "javascript:void(0)";
    a.dataset.id = item.id;
    a.innerHTML = `<img loading="lazy" src="${item.image_url}" alt="" onerror="this.style.display='none'" />`;
    a.addEventListener("click", () => {
      window.API.trackClick("carousel", item.id);
      handleAction(item);
    });
    return a;
  }

  function handleAction(item) {
    const url = item.onclick_url || "";
    // Support /?movie=ID (opening detail) and arbitrary URLs
    const m = url.match(/[?&]movie=(\d+)/);
    if (m) {
      window.Movie.openById(parseInt(m[1], 10));
      return;
    }
    if (url.startsWith("http")) window.open(url, "_blank", "noopener");
    else if (url.startsWith("#page=")) window.Pages.open(url.slice(6));
    // Otherwise ignore
  }

  function startAuto() {
    stopAuto();
    const el = track();
    if (!el || el.scrollWidth <= el.clientWidth) return;
    autoTimer = setInterval(() => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (el.scrollLeft >= maxScroll - 4) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: el.clientWidth * 0.8, behavior: "smooth" });
      }
    }, 4000);
  }
  function stopAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
  }

  // ---------- Sticky behaviour ----------
  let lastY = 0;
  let stuck = false;
  function onScroll() {
    const y = window.scrollY;
    const el = section();
    if (!el) return;

    // If scrolling down past a threshold → unstick
    if (y > 120 && y > lastY) {
      if (stuck) {
        el.classList.remove("sticky");
        stuck = false;
      }
    }
    // If scrolling up → stick
    else if (y < lastY - 4 && y > 60) {
      if (!stuck) {
        el.classList.add("sticky");
        stuck = true;
      }
    }
    // Near top → always unsticky
    if (y < 40 && stuck) {
      el.classList.remove("sticky");
      stuck = false;
    }
    lastY = y;
  }

  async function load() {
    try {
      const data = await window.API.carousel();
      items = data.results || [];
      const el = track();
      el.innerHTML = "";
      if (!items.length) return;
      items.forEach((it) => el.appendChild(slide(it)));
      startAuto();

      el.addEventListener("mouseenter", stopAuto);
      el.addEventListener("mouseleave", startAuto);
      el.addEventListener("touchstart", stopAuto, { passive: true });
      el.addEventListener("touchend", startAuto, { passive: true });

      window.addEventListener("scroll", onScroll, { passive: true });
    } catch (e) {
      console.warn("Carousel load failed:", e);
    }
  }

  window.Carousel = { load };
})();