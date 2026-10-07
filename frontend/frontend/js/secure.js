/**
 * Decrypts API responses. Per page load: ephemeral ECDH P-256 key -> shared secret with the server's
 * static key -> HKDF-SHA256 -> AES-256-GCM. Mirrors backend/services/secure.py.
 */
(function () {
  const enc = new TextEncoder();
  const b64 = {
    enc: (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    dec(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); },
  };
  let ready = null, aes = null, pub = "";

  async function init() {
    const base = (window.LYSANDRA_CONFIG.API_BASE || "").replace(/\/$/, "");
    const r = await fetch(base + "/api/secure/key");
    if (!r.ok) throw new Error("Secure channel unavailable");
    const k = await r.json();
    if (k.enabled === false) return;
    if (!window.crypto || !crypto.subtle) throw new Error("This browser cannot open the secure channel (HTTPS required).");
    const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    pub = b64.enc(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    const srv = await crypto.subtle.importKey("raw", b64.dec(k.pub), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: srv }, kp.privateKey, 256);
    const hk = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
    aes = await crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("lysandra-v1") },
      hk, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
  }
  const ensure = () => (ready = ready || init().catch((e) => { ready = null; throw e; }));

  window.Secure = {
    /** Public key to send as X-Client-Key ("" when the server has encryption off). */
    async key() { await ensure(); return pub; },
    async open(env, path) {
      await ensure();
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64.dec(env.iv), additionalData: enc.encode(path) }, aes, b64.dec(env.ct)
      );
      return JSON.parse(new TextDecoder().decode(pt));
    },
  };
})();
