/**
 * Format picker dialog + in-app player.
 * - iframe sources: embedded directly, sandboxed
 * - m3u8 sources: HLS.js if supported, native HLS fallback (Safari/iOS)
 */
(function () {
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";

  // -------- lazy-load HLS.js --------
  let hlsPromise = null;
  function loadHLS() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsPromise) return hlsPromise;
    hlsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HLS_CDN;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error("HLS.js failed to load"));
      document.head.appendChild(s);
    });
    return hlsPromise;
  }

  // -------- open format dialog --------
  let current = null;

  function openFormatPicker(item) {
    current = item;
    const list = document.getElementById("fmList");
    const players = (item.player || []).filter((p) => p && p.url);
    if (!players.length) {
      list.innerHTML = `<p style="color:var(--text-dim)">No playable source available.</p>`;
    } else {
      list.innerHTML = players
        .map(
          (p, i) => `
        <div class="format-item" data-idx="${i}">
          <div>
            <div style="font-weight:600;font-size:14px;">${p.translator || "Player " + (i + 1)}</div>
            <div style="color:var(--text-dim);font-size:12px;margin-top:2px;">${p.quality || ""} · ${p.source || ""}</div>
          </div>
          <div class="format-badge ${p.source === "m3u8" ? "m3u8" : ""}">${(p.source || "").toUpperCase()}</div>
        </div>`
        )
        .join("");
      list.querySelectorAll(".format-item").forEach((el) => {
        el.addEventListener("click", () => {
          const p = players[parseInt(el.dataset.idx, 10)];
          closeFormat();
          playSource(item, p);
        });
      });
    }
    document.getElementById("modalBackdrop").classList.add("open");
    document.getElementById("formatDialog").classList.add("open");
  }

  function closeFormat() {
    document.getElementById("formatDialog").classList.remove("open");
    document.getElementById("modalBackdrop").classList.remove("open");
  }

  // -------- actual player --------
  const pm = () => document.getElementById("playerModal");
  const host = () => document.getElementById("pmHost");
  let hlsInstance = null;

  function cleanup() {
    host().innerHTML = "";
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch {}
      hlsInstance = null;
    }
  }

  async function playSource(item, p) {
    cleanup();
    pm().classList.add("open");
    pm().setAttribute("aria-hidden", "false");

    window.API.trackWatch(item.kinopoisk_id, item.title_ru || item.title_en || "", p.source);

    if (p.source === "m3u8") {
      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      video.setAttribute("webkit-playsinline", "true");
      host().appendChild(video);

      const url = p.url;
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari / iOS native HLS
        video.src = url;
      } else {
        try {
          const Hls = await loadHLS();
          if (Hls.isSupported()) {
            hlsInstance = new Hls({ lowLatencyMode: false, enableWorker: true });
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.ERROR, (_, data) => {
              if (data.fatal) window.Toast?.show?.("Playback error. Try another source.");
            });
          } else {
            video.src = url;
          }
        } catch (e) {
          window.Toast?.show?.("Player failed: " + e.message);
        }
      }
    } else {
      // iframe embed
      const iframe = document.createElement("iframe");
      iframe.src = p.url;
      iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = "no-referrer";
      iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-presentation";
      host().appendChild(iframe);
    }
  }

  function closePlayer() {
    cleanup();
    pm().classList.remove("open");
    pm().setAttribute("aria-hidden", "true");
  }

  function init() {
    document.getElementById("fmClose").addEventListener("click", closeFormat);
    document.getElementById("pmClose").addEventListener("click", closePlayer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (pm().classList.contains("open")) closePlayer();
        else if (document.getElementById("formatDialog").classList.contains("open")) closeFormat();
      }
    });
  }

  window.Player = { open: openFormatPicker, init };
})();