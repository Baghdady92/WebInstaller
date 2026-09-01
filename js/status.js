// Readiness checks: engine loaded, secure context, WebUSB, browser.
// Marks pills ok/bad/warn and shows a gate message when the site can't work.
(() => {
  function set(id, state) {
    const el = document.getElementById(id);
    if (el) el.className = `pill ${state}`;
  }

  function gate(key) {
    const el = document.getElementById("gateMsg");
    if (!el) return;
    el.classList.remove("hidden");
    el.dataset.i18n = key;
    // Direct set in case i18n hasn't applied yet; i18n.apply() re-translates.
    el.textContent = (window.DMI18n && window.DMI18n.t(key)) || key;
  }

  function detectBrowser() {
    const ua = navigator.userAgent;
    const isBrave = !!navigator.brave;
    const isChrome = /Chrome\//.test(ua) && !isBrave && !/Edg\//.test(ua); // Edge is Chromium too — fine
    const isChromium = isChrome || /Edg\//.test(ua) || /Chromium\//.test(ua);
    return { isChrome, isChromium, isBrave, isFirefox: /Firefox\//.test(ua), isSafari: /Safari\//.test(ua) && !isChromium };
  }

  function run() {
    const log = window.DMLog;
    const problems = [];

    // 1. Engine bundle
    const engineOk = typeof window.DMEngine === "object" && !!window.DMEngine?.Adb;
    set("checkEngine", engineOk ? "ok" : "bad");
    if (!engineOk) problems.push("engine");
    log?.log(`ADB engine: ${engineOk ? "loaded" : "MISSING — bundle failed to load"}`, engineOk ? "ok" : "err");

    // 2. Secure context (HTTPS or localhost)
    const secure = window.isSecureContext;
    set("checkSecure", secure ? "ok" : "bad");
    if (!secure) problems.push("insecure");
    log?.log(`Secure context: ${secure ? "yes" : "no"}`, secure ? "ok" : "err");

    // 3. WebUSB API
    const usb = !!navigator.usb;
    set("checkUsb", usb ? "ok" : "bad");
    if (!usb) problems.push("nousb");
    log?.log(`WebUSB: ${usb ? "available" : "unavailable"}`, usb ? "ok" : "err");

    // 4. Browser (informational — warn, don't block)
    const b = detectBrowser();
    let state = "ok", note = "Chrome (Chromium) — recommended";
    if (b.isBrave) { state = "warn"; note = "Brave — Shields may block WebUSB"; problems.push("brave"); }
    else if (!b.isChromium) { state = "bad"; note = "Not a Chromium browser"; problems.push("nonchrome"); }
    set("checkBrowser", state);
    log?.log(`Browser: ${navigator.userAgent} → ${note}`, state === "ok" ? "ok" : "err");

    // Gate: the first blocking problem wins (most specific ordering).
    if (problems.includes("insecure")) gate("gate.insecure");
    else if (problems.includes("nousb")) gate("gate.nousb");
    else if (problems.includes("nonchrome")) gate("gate.nonchrome");
    else if (problems.includes("brave")) gate("gate.brave");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
