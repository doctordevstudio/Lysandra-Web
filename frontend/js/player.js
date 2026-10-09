/**
 * Source picker + in-app player (movies, series and Live TV).
 *  - HLS (.m3u8) sources — whatever label the server gives them — play in-app with HLS.js / native HLS.
 *    If that fails (CORS, dead stream, timeout) the stream link opens in a new tab automatically.
 *  - iframe sources are embedded (sandboxed). An "Open in new tab" button is always available.
 */
(function () {
  const U = window.U;
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
  const $ = (id) => document.getElementById(id);
  const isHls = (p) => p.source === "m3u8" || /\.m3u8(\?|#|$)/i.test(p.url || "");

  // -------- lazy-load HLS.js --------
  let hlsPromise = null;
  function loadHLS() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsPromise) return hlsPromise;
    hlsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HLS_CDN;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => { hlsPromise = null; reject(new Error("HLS.js failed to load")); };
      document.head.appendChild(s);
    });
    return hlsPromise;
  }

  // -------- source picker --------
  function openFormatPicker(item) {
    const live = item.kind === "livetv";
    const list = $("fmList");
    const players = (item.player || []).filter((p) => p && p.url);
    $("fmTitle").textContent = live ? "Select Source" : "Select Player";
    if (!players.length) {
      list.innerHTML = `<p style="color:var(--text-dim)">No playable source available.</p>`;
    } else {
      list.innerHTML = players.map((p, i) => {
        const hls = isHls(p);
        return `
        <div class="format-item" data-idx="${i}">
          <div style="min-width:0">
            <div class="name">${U.esc(p.translator || "Source " + (i + 1))}</div>
            <div class="sub">${U.esc(p.quality || "HD")}${live ? " · Live" : ""} · ${hls ? "plays here, new tab if blocked" : "embedded player"}</div>
          </div>
          <div class="format-badge ${hls ? "m3u8" : ""}">${hls ? "M3U8" : U.esc((p.source || "web").toUpperCase())}</div>
        </div>`;
      }).join("");
      list.querySelectorAll(".format-item").forEach((el) =>
        el.addEventListener("click", () => { const p = players[+el.dataset.idx]; closeFormat(); playSource(item, p); }));
    }
    $("modalBackdrop").classList.add("open");
    $("formatDialog").classList.add("open");
    window.Ads.fill();
  }

  function closeFormat() {
    $("formatDialog").classList.remove("open");
    if (!$("detailModal").classList.contains("open")) $("modalBackdrop").classList.remove("open");
  }

  // -------- player --------
  const pm = () => $("playerModal"), host = () => $("pmHost");
  let hlsInstance = null, currentUrl = "";

  function cleanup() {
    host().textContent = "";
    if (hlsInstance) { try { hlsInstance.destroy(); } catch {} hlsInstance = null; }
  }

  /** Fallback: open the stream link in a new tab. If the browser blocks it, offer a button (a tap always works). */
  function openInNewTab(url, reason) {
    console.warn("[Lysandra] falling back to new tab:", reason);
    cleanup();
    const w = window.open(url, "_blank");
    if (w) {
      try { w.opener = null; } catch {}
      window.Toast?.show?.("Couldn't play here — opened in a new tab");
      closePlayer();
      return;
    }
    host().innerHTML = `<div style="color:#fff;text-align:center;padding:24px;max-width:420px">
      <p style="margin:0 0 16px;line-height:1.6">This stream can't play inside the site. Open it in a new tab instead.</p>
      <button class="hire-btn" id="pmOpen">Open in new tab</button></div>`;
    $("pmOpen").addEventListener("click", () => { window.open(url, "_blank"); closePlayer(); });
  }

  function makeVideo() {
    const v = document.createElement("video");
    v.controls = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute("webkit-playsinline", "true");
    host().appendChild(v);
    return v;
  }

  async function playHls(url) {
    let failed = false;
    const fail = (reason) => { if (failed) return; failed = true; openInNewTab(url, reason); };

    // Safari / iOS: native HLS
    if (document.createElement("video").canPlayType("application/vnd.apple.mpegurl")) {
      const video = makeVideo();
      video.addEventListener("error", () => fail("native video error"));
      const dog = setTimeout(() => { if (video.readyState < 2) fail("native playback timeout"); }, 9000);
      video.addEventListener("playing", () => clearTimeout(dog));
      video.src = url;
      video.play().catch((e) => { if (e && e.name !== "NotAllowedError") fail("native play() rejected"); });
      return;
    }

    // HLS.js (Android Chrome, desktop, …)
    try {
      const Hls = await loadHLS();
      if (!Hls.isSupported()) return fail("HLS.js not supported");
      const video = makeVideo();
      hlsInstance = new Hls({
        lowLatencyMode: false, enableWorker: true, maxBufferLength: 30, backBufferLength: 30,
        manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 2,
      });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(video);
      let recovered = false;
      hlsInstance.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) { recovered = true; hlsInstance.recoverMediaError(); return; }
        fail("HLS fatal: " + data.type + "/" + data.details);
      });
      const dog = setTimeout(() => { if (video.readyState < 2) fail("HLS playback timeout"); }, 9000);
      video.addEventListener("playing", () => clearTimeout(dog));
      video.addEventListener("error", () => fail("video element error"));
    } catch (e) {
      fail("HLS.js load failed: " + e.message);
    }
  }

  async function playSource(item, p) {
    cleanup();
    currentUrl = p.url;
    pm().classList.add("open");
    pm().setAttribute("aria-hidden", "false");
    $("pmExt").classList.remove("hidden");

    window.WatchHistory.add(item);
    window.API.trackWatch(item.kinopoisk_id, item.title_ru || item.title_en || "", p.source, item.kind); // fire-and-forget

    if (isHls(p)) return playHls(p.url);

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
    $("pmExt").classList.add("hidden");
  }

  function init() {
    $("fmClose").addEventListener("click", closeFormat);
    $("pmClose").addEventListener("click", closePlayer);
    $("pmExt").addEventListener("click", () => { if (currentUrl) window.open(currentUrl, "_blank"); closePlayer(); });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (pm().classList.contains("open")) closePlayer();
      else if ($("formatDialog").classList.contains("open")) closeFormat();
    });
  }

  window.Player = { open: openFormatPicker, init };
})();
