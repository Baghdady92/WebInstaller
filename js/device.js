// WebUSB connect flow + device info panel + disconnect handling.
// Exposes window.DMDevice: { state, serial, connect(), disconnect(), refreshInfo() }
// State: "idle" | "connecting" | "connected"
(function (global) {
  "use strict";

  const PKG = "com.example.displaymirror";

  const state = {
    mode: "idle",     // idle | connecting | connected
    manager: null,
    device: null,     // AdbDaemonWebUsbDevice
    adb: null,        // Adb instance
    serial: null,
    info: null,       // { model, android, firmware, dmVersion }
  };

  function log(msg, cls) { global.DMLog?.log(msg, cls); }
  function t(key, fallback) { return global.DMI18n ? global.DMI18n.t(key) : (fallback ?? key); }

  function ensureManager() {
    if (!state.manager) state.manager = new global.DMEngine.AdbDaemonWebUsbDeviceManager(navigator.usb);
    return state.manager;
  }

  function shellText(args) {
    return state.adb.subprocess.noneProtocol.spawnWaitText(args);
  }

  async function readDeviceInfo() {
    const [model, android, firmware, pkgDump] = await Promise.all([
      state.adb.getProp("ro.product.model").catch(() => ""),
      state.adb.getProp("ro.build.version.release").catch(() => ""),
      state.adb.getProp("ro.build.display.id").catch(() => ""),
      shellText(["dumpsys", "package", PKG]).catch(() => ""),
    ]);
    const m = /versionName=([^\s]+)/.exec(pkgDump);
    return {
      model: model || "?",
      android: android || "?",
      firmware: firmware || "?",
      dmVersion: m ? m[1] : null,
    };
  }

  function render() {
    document.querySelectorAll("[data-dm-state]").forEach((el) => {
      el.hidden = el.dataset.dmState.split(" ").indexOf(state.mode) === -1;
    });
    const btn = document.getElementById("connectBtn");
    if (btn) {
      btn.disabled = state.mode !== "idle";
      // Idle text is owned by i18n (data-i18n="connectBtn"); only override while busy.
      if (state.mode === "connecting") btn.textContent = t("connect.btn.connecting", "Connecting…");
      else btn.textContent = t("connectBtn", "Connect the head unit");
    }
    const panel = document.getElementById("devicePanel");
    if (panel && state.info) {
      panel.querySelector('[data-field="model"]').textContent = state.info.model;
      panel.querySelector('[data-field="android"]').textContent = state.info.android;
      panel.querySelector('[data-field="firmware"]').textContent = state.info.firmware;
      const dm = panel.querySelector('[data-field="dmVersion"]');
      dm.textContent = state.info.dmVersion
        ? t("device.dmInstalled", "DisplayMirror") + " v" + state.info.dmVersion
        : t("device.dmNotInstalled", "DisplayMirror not installed");
      dm.classList.toggle("ok", !!state.info.dmVersion);
    }
    const serialEl = document.getElementById("deviceSerial");
    if (serialEl) serialEl.textContent = state.serial ?? "—";
    document.dispatchEvent(new CustomEvent(state.mode === "connected" ? "dm-connected" : "dm-disconnected"));
  }

  function reset(reason, cls) {
    try { state.adb?.dispose(); } catch { /* already dead */ }
    state.mode = "idle";
    state.device = null;
    state.adb = null;
    state.serial = null;
    state.info = null;
    if (reason) log(reason, cls);
    render();
  }

  async function connect() {
    if (state.mode !== "idle") return;
    state.mode = "connecting";
    render();
    try {
      const manager = ensureManager();
      log(t("connect.waitingPick", "Waiting for device selection…"));
      const device = await manager.requestDevice();
      if (!device) throw new Error(t("connect.noInterface", "Selected device has no ADB interface"));
      state.device = device;

      log(t("connect.connecting", "Connecting to") + " " + (device.serial ?? "?") + " …");
      const connection = await device.connect();

      log(t("connect.auth", "Authenticating — approve the prompt on the car screen if it appears…"));
      const transport = await global.DMEngine.AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: global.DMKeys.credentialStore(),
      });
      state.adb = new global.DMEngine.Adb(transport);
      state.serial = device.serial ?? "?";
      state.mode = "connected";
      log(t("connect.ok", "Connected") + ": " + state.serial, "ok");
      render();

      state.info = await readDeviceInfo();
      log(`${state.info.model} · Android ${state.info.android} · FW ${state.info.firmware}` +
          (state.info.dmVersion ? ` · DisplayMirror v${state.info.dmVersion}` : " · DisplayMirror not installed"), "ok");
      render();
    } catch (e) {
      const msg = String(e?.message ?? e);
      log(t("connect.failed", "Connect failed") + ": " + msg, "err");
      reset();
    }
  }

  function init() {
    document.getElementById("connectBtn")?.addEventListener("click", connect);
    // Auto-detect cable unplug (WebUSB "disconnect" fires for granted devices).
    navigator.usb?.addEventListener("disconnect", (e) => {
      if (state.device && e.device === state.device.raw) {
        reset(t("connect.disconnected", "USB device disconnected"), "err");
      }
    });
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.DMDevice = { state, connect, refreshInfo: async () => { if (state.mode === "connected") { state.info = await readDeviceInfo(); render(); } } };
})(typeof window !== "undefined" ? window : globalThis);
