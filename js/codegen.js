// G700 engineer-menu code — pure module, no DOM. Mirrors the car firmware's
// time-based unlock code; reimplemented from firmware behavior documented in
// PLAN.md §1/§6. Vectors in scripts/test-codegen.mjs must be verified against
// a real car before relying on them.
//
// code = ((seed * (mm*10000 + dd*100 + hh) - hh) mod 10^6), zero-padded,
// with mm/dd/hh in the car's local time (hh = 0–23).
(function (global) {
  "use strict";

  const MOD = 1000000n;

  // Firmware table — config data, new firmware may change it.
  const FIRMWARE = [
    { id: "v335", label: "3.30 – 3.35", seed: 20250530, dial: "*#20240730#*", dynamic: false },
    { id: "v336", label: "3.36 – 3.37+", seed: 20251030, dial: null, dynamic: true },
  ];

  /**
   * @param {{mm:number, dd:number, hh:number, seed:number}} parts car-local date/time
   * @returns {string} 6-digit code
   */
  function engineerCode({ mm, dd, hh, seed }) {
    const n = BigInt(seed) * BigInt(mm * 10000 + dd * 100 + hh) - BigInt(hh);
    return (((n % MOD) + MOD) % MOD).toString().padStart(6, "0");
  }

  /** Car-local date/hour for a timezone (or browser-local when tz is falsy). */
  function carParts(tz) {
    const opts = {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    };
    if (tz) opts.timeZone = tz;
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", opts)
        .formatToParts(new Date(Date.now()))
        .map((x) => [x.type, x.value]),
    );
    let hour = parseInt(p.hour, 10);
    if (hour === 24) hour = 0;
    return {
      iso: `${p.year}-${p.month}-${p.day}`,
      mm: parseInt(p.month, 10),
      dd: parseInt(p.day, 10),
      hh: hour,
      minute: parseInt(p.minute, 10),
    };
  }

  const api = { engineerCode, carParts, FIRMWARE, MOD };

  if (typeof module !== "undefined" && module.exports) module.exports = api; // Node (tests)
  else global.DMCodegen = api; // browser
})(typeof window !== "undefined" ? window : globalThis);
