// Step 1 — "Enable ADB on the car (once)": firmware + region pickers, the
// live time-based unlock code (rotates hourly), dial code, illustrated steps
// and troubleshooting. Pure display; the math lives in codegen.js.
(function (global) {
  "use strict";

  // Regions where these cars ship; each maps to the timezone the CAR's clock
  // most likely runs in. The generated code is tied to the car's clock, so the
  // pick matters more than the visitor's own timezone.
  const REGIONS = [
    { id: "sa", en: "Saudi Arabia", ar: "السعودية", tz: "Asia/Riyadh" },
    { id: "ae", en: "UAE", ar: "الإمارات", tz: "Asia/Dubai" },
    { id: "qa", en: "Qatar", ar: "قطر", tz: "Asia/Qatar" },
    { id: "kw", en: "Kuwait", ar: "الكويت", tz: "Asia/Kuwait" },
    { id: "bh", en: "Bahrain", ar: "البحرين", tz: "Asia/Bahrain" },
    { id: "om", en: "Oman", ar: "عُمان", tz: "Asia/Muscat" },
    { id: "eg", en: "Egypt", ar: "مصر", tz: "Africa/Cairo" },
    { id: "jo", en: "Jordan", ar: "الأردن", tz: "Asia/Amman" },
    { id: "iq", en: "Iraq", ar: "العراق", tz: "Asia/Baghdad" },
    { id: "other", en: "Other / not listed", ar: "أخرى / غير مدرجة", tz: "Etc/UTC" },
  ];

  const OFFSETS = [-2, -1, 0, 1, 2];

  let timer = null;

  function t(key, fallback) { return global.DMI18n ? global.DMI18n.t(key) : (fallback ?? key); }
  function regionName(r) { const lang = global.DMI18n?.lang; return (lang && r[lang]) || r.en; }

  function currentConfig() {
    const fwId = document.getElementById("fwVer")?.value;
    const fw = global.DMCodegen.FIRMWARE.find((f) => f.id === fwId) ?? global.DMCodegen.FIRMWARE[0];
    const region = REGIONS.find((r) => r.id === document.getElementById("region")?.value) ?? REGIONS[0];
    const offset = parseInt(document.getElementById("clockOffset")?.value ?? "0", 10) || 0;
    return { fw, region, offset };
  }

  function render() {
    const { fw, region, offset } = currentConfig();
    const parts = global.DMCodegen.carParts(region.tz, offset ? Date.now() + offset * 3600e3 : undefined);
    const code = global.DMCodegen.engineerCode({ mm: parts.mm, dd: parts.dd, hh: parts.hh, seed: fw.seed });

    const codeEl = document.getElementById("engCode");
    if (codeEl) codeEl.textContent = code;
    const dialEl = document.getElementById("dialCode");
    if (dialEl) dialEl.textContent = fw.dynamic ? `*#${code}#*` : fw.dial;
    const clockEl = document.getElementById("carClock");
    if (clockEl) {
      clockEl.textContent =
        `${parts.iso} · ${String(parts.hh).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} (${region.tz}${offset ? ", " + (offset > 0 ? "+" : "") + offset + "h" : ""})`;
    }
    const hintEl = document.getElementById("fwHint");
    if (hintEl) hintEl.textContent = fw.dynamic ? t("guide.v336hint", "On 3.36+ the dial code and the menu password are the SAME code — it changes every hour.") : "";

    // Countdown to the next hourly rotation.
    const cdEl = document.getElementById("codeCountdown");
    if (cdEl) {
      const secs = 3600 - (parts.minute * 60 + new Date().getSeconds());
      cdEl.textContent = t("guide.changesIn", "changes in") + " " +
        `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    }
  }

  function buildPickers() {
    const fwSel = document.getElementById("fwVer");
    if (fwSel) {
      fwSel.innerHTML = global.DMCodegen.FIRMWARE
        .map((f) => `<option value="${f.id}">${f.label}</option>`).join("");
    }
    const rSel = document.getElementById("region");
    if (rSel) {
      rSel.innerHTML = REGIONS
        .map((r) => `<option value="${r.id}">${regionName(r)}</option>`).join("");
    }
    const oSel = document.getElementById("clockOffset");
    if (oSel) {
      oSel.innerHTML = OFFSETS.map((o) =>
        `<option value="${o}"${o === 0 ? " selected" : ""}>${o === 0 ? t("guide.offset0", "matches region time") : (o > 0 ? "+" : "") + o + t("guide.offsetH", "h")}</option>`).join("");
    }
  }

  function init() {
    buildPickers();
    ["fwVer", "region", "clockOffset"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", render);
    });
    // Re-translate the offset labels when the language flips, then rebuild.
    document.addEventListener("dm-lang-changed", () => { buildPickers(); render(); });
    render();
    timer = setInterval(render, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.DMGuide = { REGIONS, refresh: render };
})(typeof window !== "undefined" ? window : globalThis);
