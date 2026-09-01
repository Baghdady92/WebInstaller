// Tests for js/keys.js DER encoding + real WebCrypto round-trip.
// Run in Node (26+ has crypto.subtle). The vendor engine bundle is loaded to
// validate our PKCS#1 DER against the library's own parser.
import { readFileSync } from "node:fs";

const load = (rel, globalName) => {
  const src = readFileSync(new URL(rel, import.meta.url), "utf8");
  return new Function(`${src}; return ${globalName};`)();
};

// Bundle defines `var DMEngine = ...` at script top level — hoist it explicitly.
const engineSrc = readFileSync(new URL("../vendor/dm-engine.bundle.js", import.meta.url), "utf8");
new Function(`${engineSrc}; globalThis.DMEngine = DMEngine;`)();
const DMEngine = globalThis.DMEngine;
if (!DMEngine?.Adb) throw new Error("engine bundle did not load");

const K = load("../js/keys.js", "DMKeys");

let failures = 0;
const ok = (cond, label, extra = "") => {
  if (!cond) { console.error(`FAIL ${label} ${extra}`); failures++; }
  else console.log(`ok   ${label}`);
};

// ── derInt minimal encoding ────────────────────────────────────────────
const hex = (u8) => Buffer.from(u8).toString("hex");
ok(hex(K.derInt(new Uint8Array([0x01]))) === "020101", "derInt small");
ok(hex(K.derInt(new Uint8Array([0x80]))) === "02020080", "derInt high-bit padded");
ok(hex(K.derInt(new Uint8Array([0, 0, 0x7f]))) === "02017f", "derInt strips zeros");

// ── real key round-trip ────────────────────────────────────────────────
const pair = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-1" },
  true, ["sign", "verify"],
);
const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
const pkcs1 = K.jwkToPkcs1(jwk);
ok(pkcs1[0] === 0x30 && pkcs1.length > 1150 && pkcs1.length < 1250, "pkcs1 is SEQUENCE of sane size", `(len=${pkcs1.length})`);

// The library must be able to derive the public key from our PKCS#1 encoding.
const pub = new Uint8Array(524);
let genThrew = false;
try { DMEngine.adbGeneratePublicKey(pkcs1, pub); } catch { genThrew = true; }
ok(!genThrew, "engine parses our pkcs1 (adbGeneratePublicKey)");
ok(pub[0] === 0x40 && pub[1] === 0 && pub[2] === 0 && pub[3] === 0, "mincrypt struct word-count == 64");

// PKCS#8 must import back into WebCrypto — this is exactly what DisplayMirror
// will consume in Phase 3.
const pkcs8 = K.pkcs1ToPkcs8(pkcs1);
let imported = null;
try {
  imported = await crypto.subtle.importKey("pkcs8", pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" }, true, ["sign"]);
} catch { /* leave null */ }
ok(!!imported, "pkcs8 re-imports into WebCrypto");

// Signature equivalence: pkcs1-derived key signs identically to the original.
if (imported) {
  const data = new TextEncoder().encode("displaymirror roundtrip");
  const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" };
  const s1 = new Uint8Array(await crypto.subtle.sign(alg, pair.privateKey, data));
  const s2 = new Uint8Array(await crypto.subtle.sign(alg, imported, data));
  ok(Buffer.from(s1).equals(Buffer.from(s2)), "signatures match across round-trip");
}

// ── PEM formatting ─────────────────────────────────────────────────────
const pem = K.toPem(pkcs8, "PRIVATE KEY");
ok(/^-----BEGIN PRIVATE KEY-----\n[ A-Za-z0-9+/+=\n]+-----END PRIVATE KEY-----\n$/.test(pem)
  && pem.split("\n").slice(1, -2).every(l => l.length <= 64), "PEM shape (64-col lines)");

process.exit(failures ? 1 : 0);
