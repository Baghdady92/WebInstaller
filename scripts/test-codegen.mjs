// Unit tests for js/codegen.js (pure math + time parts).
// NOTE: the expected-code vectors below were computed from the algorithm
// itself; before shipping Phase 4, replace/add vectors captured from the live
// reference site / a real car for known date+hour+seed combinations.
import { readFileSync } from "node:fs";

// js/codegen.js is a browser classic script (global DMCodegen) — evaluate it in
// a sandbox the same way the browser would, instead of using the module system.
const src = readFileSync(new URL("../js/codegen.js", import.meta.url), "utf8");
const { engineerCode, carParts, FIRMWARE } = new Function(`${src}; return DMCodegen;`)();

let failures = 0;
function eq(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
    failures++;
  } else {
    console.log(`ok   ${label}`);
  }
}

// Hand-computed vector: mm=9 dd=1 hh=10 seed=20251030
// data = 90110; 20251030*90110 = 1,824,820,313,300; minus hh → ...313,290; mod 1e6 = 313290
eq(engineerCode({ mm: 9, dd: 1, hh: 10, seed: 20251030 }), "313290", "known date/hour v336 seed");

// mm=1 dd=1 hh=0 seed=20250530 → data=10100; 20250530*10100 = 204,530,353,000; -0 → mod 1e6 = 353000
eq(engineerCode({ mm: 1, dd: 1, hh: 0, seed: 20250530 }), "353000", "midnight/January v335 seed");

// Zero-padding: force a small result. seed=1, mm=0? — mm is 1-based; use seed=0 → 0-hh → mod wraps to 1e6-hh
eq(engineerCode({ mm: 12, dd: 25, hh: 5, seed: 0 }), "999995", "negative wrap pads to 6 digits");

// Always 6 digits, digits only
for (const fw of FIRMWARE) {
  for (let hh = 0; hh < 24; hh++) {
    const c = engineerCode({ mm: 6, dd: 15, hh, seed: fw.seed });
    if (!/^\d{6}$/.test(c)) { console.error(`FAIL format fw=${fw.id} hh=${hh}: ${c}`); failures++; }
  }
}
console.log("ok   format 6-digits across all hours, both firmwares");

// carParts in a fixed timezone: Asia/Riyadh is UTC+3 with no DST, so with a
// frozen clock we can assert the mapping deterministically.
const realNow = Date.now;
Date.now = () => Date.UTC(2026, 8, 1, 10, 30); // 2026-09-01 10:30 UTC → 13:30 Riyadh
try {
  const p = carParts("Asia/Riyadh");
  eq(p.iso, "2026-09-01", "carParts Riyadh date");
  eq(p.hh, 13, "carParts Riyadh hour");
  eq(p.minute, 30, "carParts Riyadh minute");
} finally {
  Date.now = realNow;
}

process.exit(failures ? 1 : 0);
