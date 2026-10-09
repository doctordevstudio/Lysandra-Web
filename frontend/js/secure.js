/**
 * Encrypted channel to the server (mirrors backend/services/secure.py).
 * No key exists in this file: each page load creates a fresh, NON-extractable ECDH key pair inside the
 * browser's crypto engine, derives two AES-GCM keys with the server (also non-extractable) and keeps
 * them out of JavaScript's reach. Nothing here can be copied and reused elsewhere.
 */
(function () {
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = {
    enc(u8) {
      let s = "";
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    dec(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); },
  };
  let ready = null, kDec = null, kEnc = null, pub = "", skew = 0;

  async function init() {
    const base = (window.LYSANDRA_CONFIG.API_BASE || "").replace(/\/$/, "");
    const r = await fetch(base + "/api/secure/key", { cache: "no-store" });
    if (!r.ok) throw new Error("Secure channel unavailable");
    const k = await r.json();
    if (k.enabled === false) return;
    if (!window.crypto || !crypto.subtle) throw new Error("This browser cannot open the secure channel (HTTPS required).");
    skew = (k.now || Date.now()) - Date.now(); // phone clock may be off; align with the server
    const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    pub = b64.enc(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    const srv = await crypto.subtle.importKey("raw", b64.dec(k.pub), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: srv }, kp.privateKey, 256);
    const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    const derive = (info, use) => crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode(info) },
      hk, { name: "AES-GCM", length: 256 }, false, [use]);
    [kDec, kEnc] = await Promise.all([derive("lysandra-v1", "decrypt"), derive("lysandra-v1-c2s", "encrypt")]);
  }
  const ensure = () => (ready = ready || init().catch((e) => { ready = null; throw e; }));

  window.Secure = Object.freeze({
    /** Public key for the X-Client-Key header ("" when the server runs without encryption). */
    async key() { await ensure(); return pub; },
    /** Decrypt a server response envelope. */
    async open(env, path) {
      await ensure();
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64.dec(env.iv), additionalData: te.encode(path) }, kDec, b64.dec(env.ct));
      return JSON.parse(td.decode(pt));
    },
    /** Encrypt a request payload (timestamped to stop replays). */
    async seal(obj, path) {
      await ensure();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const pt = te.encode(JSON.stringify({ ...obj, t: Date.now() + skew }));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(path) }, kEnc, pt);
      return { v: 1, iv: b64.enc(iv), ct: b64.enc(new Uint8Array(ct)) };
    },
  });
})();
