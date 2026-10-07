/**
 * Format picker dialog + in-app player.
 * - iframe sources: embedded directly, sandboxed
 * - m3u8 sources: tries HLS.js / native HLS first; on CORS/network error,
 *   opens the stream URL in a new browser tab.
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
        .map((p, i) => {
          const isM3u8 = p.source === "m3u8";
          const hint = isM3u8 ? "opens in-app or new tab" : (p.source || "");
          return `
        <div class="format-item" data-idx="${i}">
          <div>
            <div style="font-weight:600;font-size:14px;">${p.translator || "Player " + (i + 1)}</div>
            <div style="color:var(--text-dim);font-size:12px;margin-top:2px;">${p.quality || ""} · ${hint}</div>
          </div>
          <div class="format-badge ${isM3u8 ? "m3u8" : ""}">${(p.source || "").toUpperCase()}</div>
        </div>`;
        })
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
    if (!document.getElementById("detailModal").classList.contains("open")) document.getElementById("modalBackdrop").classList.remove("open");
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

  /**
   * Opens the m3u8 in a new tab AND closes the player modal.
   * Used as a fallback when in-app playback can't work.
   */
  function openInNewTab(url, reason) {
    console.warn("[Lysandra] Falling back to new tab:", reason);
    window.Toast?.show?.("Opening stream in new tab…");
    // Small delay so the toast is visible before the tab switch
    setTimeout(() => {
      window.open(url, "_blank", "noopener,noreferrer");
      closePlayer();
    }, 400);
  }

  async function playSource(item, p) {
    cleanup();
    pm().classList.add("open");
    pm().setAttribute("aria-hidden", "false");

    window.WatchHistory.add(item);
    // Fire-and-forget analytics
    window.API.trackWatch(
      item.kinopoisk_id,
      item.title_ru || item.title_en || "",
      p.source
    );

    // ---------- M3U8 ----------
    if (p.source === "m3u8") {
      const url = p.url;

      // Safari / iOS native HLS
      if (document.createElement("video").canPlayType("application/vnd.apple.mpegurl")) {
        const video = document.createElement("video");
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("webkit-playsinline", "true");
        host().appendChild(video);

        let failed = false;
        const fail = (reason) => {
          if (failed) return;
          failed = true;
          openInNewTab(url, reason);
        };

        video.addEventListener("error", () => fail("native video error"));
        // 6s timeout: if playback hasn't started, assume it won't
        const watchdog = setTimeout(() => {
          if (video.readyState < 2) fail("native playback timeout");
        }, 6000);
        video.addEventListener("playing", () => clearTimeout(watchdog));

        video.src = url;
        video.play().catch((e) => { if (e && e.name !== "NotAllowedError") fail("native play() rejected"); });
        return;
      }

      // HLS.js path (Android Chrome, desktop, etc.)
      try {
        const Hls = await loadHLS();
        if (!Hls.isSupported()) {
          openInNewTab(url, "HLS.js not supported");
          return;
        }

        const video = document.createElement("video");
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute("webkit-playsinline", "true");
        host().appendChild(video);

        hlsInstance = new Hls({
          lowLatencyMode: false,
          enableWorker: true,
          // Give up faster on network errors so we can fall back quickly
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 2,
        });
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(video);

        let failed = false;
        const fail = (reason) => {
          if (failed) return;
          failed = true;
          try { hlsInstance && hlsInstance.destroy(); } catch {}
          hlsInstance = null;
          openInNewTab(url, reason);
        };

        hlsInstance.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            // CORS / network errors are the usual suspects
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR ||
              data.details === "manifestLoadError" ||
              data.details === "manifestLoadTimeOut"
            ) {
              fail("HLS network/CORS: " + data.details);
            } else {
              fail("HLS fatal: " + data.type + "/" + data.details);
            }
          }
        });

        // Watchdog: if nothing plays within 6s, bail out
        const watchdog = setTimeout(() => {
          if (video.readyState < 2) fail("HLS playback timeout");
        }, 6000);
        video.addEventListener("playing", () => clearTimeout(watchdog));
        video.addEventListener("error", () => fail("video element error"));

      } catch (e) {
        openInNewTab(url, "HLS.js load failed: " + e.message);
      }
      return;
    }

    // ---------- iframe ----------
    const iframe = document.createElement("iframe");
    iframe.src = p.url;
    iframe.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "no-referrer";
    iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-presentation";
    host().appendChild(iframe);
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
