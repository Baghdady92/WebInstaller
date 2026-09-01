// ADB credential store with EXTRACTABLE keys.
//
// The @yume-chan/adb transport needs a credential store whose keys are
// { buffer: <PKCS#1 DER private key>, name? }. WebCrypto can only export JWK
// or PKCS#8, so we DER-encode PKCS#1 ourselves from the JWK — keeping the key
// extractable so Phase 3 can push the SAME identity (PKCS#8 PEM) into
// DisplayMirror's files for its local ADB client.
//
// Persisted in IndexedDB ("dm-installer"/"keys", record id "default").
(function (global) {
  "use strict";

  const KEY_NAME = "displaymirror@webinstaller";
  const DB_NAME = "dm-installer";
  const STORE = "keys";

  // ── DER encoding (pure, testable) ────────────────────────────────────
  function b64uToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("binary");
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }

  function bytesToB64(bytes) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  }

  function derLen(n) {
    if (n < 128) return [n];
    const bytes = [];
    let x = n;
    while (x) { bytes.unshift(x & 255); x >>= 8; }
    return [0x80 | bytes.length, ...bytes];
  }

  function derInt(bytes) {
    // Minimal unsigned INTEGER: strip redundant leading zeros, prepend 0x00
    // when the high bit is set.
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0 && !(bytes[i + 1] & 0x80)) i++;
    bytes = bytes.slice(i);
    if (!bytes.length || bytes[0] & 0x80) bytes = new Uint8Array([0, ...bytes]);
    return new Uint8Array([0x02, ...derLen(bytes.length), ...bytes]);
  }

  function concat(parts) {
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function derSeq(parts) {
    const body = concat(parts);
    return concat([new Uint8Array([0x30, ...derLen(body.length)]), body]);
  }

  /** RSA private JWK → PKCS#1 DER (RSAPrivateKey). */
  function jwkToPkcs1(jwk) {
    return derSeq([
      derInt(new Uint8Array([0])), // version two-prime(0)
      derInt(b64uToBytes(jwk.n)),
      derInt(b64uToBytes(jwk.e)),
      derInt(b64uToBytes(jwk.d)),
      derInt(b64uToBytes(jwk.p)),
      derInt(b64uToBytes(jwk.q)),
      derInt(b64uToBytes(jwk.dp)),
      derInt(b64uToBytes(jwk.dq)),
      derInt(b64uToBytes(jwk.qi)),
    ]);
  }

  // PKCS#8 PrivateKeyInfo: SEQUENCE( version 0, AlgID(rsaEncryption), OCTET STRING pkcs1 )
  const RSA_OID = new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  function pkcs1ToPkcs8(pkcs1) {
    return derSeq([
      derInt(new Uint8Array([0])),
      derSeq([RSA_OID]),
      new Uint8Array([0x04, ...derLen(pkcs1.length), ...pkcs1]),
    ]);
  }

  function toPem(der, label) {
    const b64 = bytesToB64(der);
    const lines = b64.match(/.{1,64}/g) ?? [];
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
  }

  // ── Key generation & storage ─────────────────────────────────────────
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function idbRun(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function createKey() {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-1" },
      true, // extractable — required for the Phase-3 push
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const pkcs1 = jwkToPkcs1(jwk);
    const record = { id: "default", pkcs1, pkcs8: pkcs1ToPkcs8(pkcs1), createdAt: Date.now() };
    await idbRun("readwrite", (store) => store.put(record, "default"));
    return record;
  }

  async function loadKey() {
    return (await idbRun("readonly", (store) => store.get("default"))) ?? null;
  }

  async function getOrCreate() {
    return (await loadKey()) ?? (await createKey());
  }

  /** Android adbkey.pub payload (base64-encoded 524-byte mincrypt struct + key name). */
  async function getAndroidPublicKey() {
    const rec = await getOrCreate();
    const { adbGeneratePublicKey } = global.DMEngine;
    const out = new Uint8Array(524); // adbGetPublicKeySize(): 4+4+256+256+4 for RSA-2048
    adbGeneratePublicKey(rec.pkcs1, out);
    return `${bytesToB64(out)} ${KEY_NAME}\n`;
  }

  /** PKCS#8 PEM of the private key — the standard adbkey file format. */
  async function getPrivateKeyPem() {
    const rec = await getOrCreate();
    return toPem(rec.pkcs8, "PRIVATE KEY");
  }

  /** Credential store for AdbDaemonTransport.authenticate (same identity every connect). */
  function credentialStore() {
    return {
      async *iterateKeys() {
        const rec = await loadKey();
        if (rec) yield { buffer: rec.pkcs1, name: KEY_NAME };
      },
      async generateKey() {
        const rec = await createKey();
        return { buffer: rec.pkcs1, name: KEY_NAME };
      },
    };
  }

  const api = {
    // pure helpers (exported for tests)
    derInt, derSeq, jwkToPkcs1, pkcs1ToPkcs8, toPem, b64uToBytes, bytesToB64,
    // storage / auth
    createKey, loadKey, getOrCreate, getAndroidPublicKey, getPrivateKeyPem, credentialStore, KEY_NAME,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.DMKeys = api;
})(typeof window !== "undefined" ? window : globalThis);
