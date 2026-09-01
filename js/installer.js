// One-click install pipeline: fetch latest APK from GitHub Releases →
// push via ADB sync → pm install -r → permissions/autostart setup → launch.
// Mirrors DisplayMirror/install.sh and the `setup:` Makefile target — keep
// them in sync (see AGENTS.md).
//
// Every setup step is "required" (failure aborts) or "tolerant" (logged,
// pipeline continues). ADB-key push is Phase 3 and intentionally absent here.
(function (global) {
  "use strict";

  const REPO = "Baghdady92/DisplayMirror";
  const PKG = "com.example.displaymirror";
  const ACTIVITY = `${PKG}/.MainActivity`;
  const TMP_APK = "/data/local/tmp/dm-install.apk";

  const RUNTIME_PERMS = [
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.HIGH_SAMPLING_RATE_SENSORS",
  ];

  const CAR_PERMS = [
    "android.car.permission.CAR_SPEED",
    "android.car.permission.CAR_ENERGY",
    "android.car.permission.CAR_ENGINE_DETAILED",
    "android.car.permission.CAR_POWERTRAIN",
    "android.car.permission.CAR_TIRES",
    "android.car.permission.CAR_INFO",
    "android.car.permission.CAR_EXTERIOR_ENVIRONMENT",
    "android.car.permission.CAR_MILEAGE",
    "android.car.permission.CAR_VENDOR_EXTENSION",
    "android.car.permission.CAR_DYNAMICS_STATE",
    "android.car.permission.CONTROL_CAR_CLIMATE",
    "android.permission.READ_CAR_DISPLAY_UNITS",
    "android.car.permission.CAR_DRIVING_STATE",
  ];

  function log(msg, cls) { global.DMLog?.log(msg, cls); }
  function t(key, fallback) { return global.DMI18n ? global.DMI18n.t(key) : (fallback ?? key); }

  function adb() {
    const a = global.DMDevice?.state?.adb;
    if (!a) throw new Error(t("install.notConnected", "Not connected"));
    return a;
  }

  function shell(args) {
    return adb().subprocess.noneProtocol.spawnWaitText(args);
  }

  // ── APK sources ──────────────────────────────────────────────────────
  // Downloads must be CORS-enabled. GitHub release assets are NOT (no
  // Access-Control-Allow-Origin), and the GitHub API is rate-limited (60/h).
  // So the primary source is this repo's own apks/ folder, served by
  // raw.githubusercontent.com with CORS and no rate limit. Update apks/
  // (APK + latest.json) whenever a DisplayMirror release is published.
  const MANIFEST_BASE = "https://raw.githubusercontent.com/Baghdady92/WebInstaller/master/apks/";
  const LATEST_CACHE = "dm-latest-release";
  const LATEST_TTL = 30 * 60 * 1000;

  function readCachedLatest() {
    try { return JSON.parse(localStorage.getItem(LATEST_CACHE) ?? "null"); } catch { return null; }
  }

  async function fetchLatest() {
    const cached = readCachedLatest();
    if (cached && Date.now() - cached.ts < LATEST_TTL) return cached.rel;
    try {
      const res = await fetch(MANIFEST_BASE + "latest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      const m = await res.json();
      if (!/^DisplayMirror-v.*\.apk$/.test(m.apk ?? "")) throw new Error(t("install.noAsset", "No APK asset in latest release"));
      const rel = { version: m.version, url: MANIFEST_BASE + m.apk, size: m.size, name: m.apk, sha256: m.sha256 };
      try { localStorage.setItem(LATEST_CACHE, JSON.stringify({ ts: Date.now(), rel })); } catch { /* storage full/blocked */ }
      return rel;
    } catch (e) {
      if (cached) {
        log(`${t("install.usingCache", "Download source unavailable — using cached release info")}: ${cached.rel.version}`, "err");
        return cached.rel;
      }
      showMirrorLink();
      throw e;
    }
  }

  // Mirror fallback — filedn.eu has no CORS headers either, so this can only
  // be offered as a manual download link (then install via local APK).
  // NOTE: pinned version — update when publishing a new release.
  const MIRROR = {
    url: "https://filedn.eu/lc46PET1PcpBm1wpl6lHxRQ/Jetour_G700/G700%20ONLY/DisplayMirror-v3.24.0.apk",
    version: "v3.24.0",
  };

  function showMirrorLink() {
    const el = document.getElementById("mirrorLink");
    if (!el) return;
    el.href = MIRROR.url;
    el.hidden = false;
  }

  async function downloadApk(rel, onProgress) {
    const res = await fetch(rel.url);
    if (!res.ok) throw new Error(`Download ${res.status}`);
    const total = +res.headers.get("Content-Length") || rel.size || 0;
    if (!res.body) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress?.(got, total);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  // ── Pipeline steps ───────────────────────────────────────────────────
  // Each step: { id, i18n key, run: async (ctx) => void }. Throw = required
  // failure; step.tolerant downgrades a throw to a warning.
  const steps = [
    {
      id: "download", key: "install.step.download", required: true,
      async run(ctx) {
        ctx.localFile = pendingLocalFile ?? null;
        pendingLocalFile = null;
        updatePickedIndicator();
        if (ctx.localFile) { ctx.apk = new Uint8Array(await ctx.localFile.arrayBuffer()); return; }
        ctx.release = await fetchLatest();
        log(`${t("install.downloading", "Downloading")} ${ctx.release.name} (${(ctx.release.size / 1048576).toFixed(1)} MB)…`);
        ctx.apk = await downloadApk(ctx.release, (got, total) => {
          setProgress(got / total, `${(got / 1048576).toFixed(1)} MB`);
        });
        setProgress(1, `${(ctx.apk.length / 1048576).toFixed(1)} MB`);
        if (ctx.release.sha256) {
          const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", ctx.apk))]
            .map((b) => b.toString(16).padStart(2, "0")).join("");
          if (h !== ctx.release.sha256) throw new Error(t("install.checksum", "APK checksum mismatch — download corrupted, try again"));
          log("sha256 ✓", "ok");
        }
      },
    },
    {
      id: "push", key: "install.step.push", required: true,
      async run(ctx) {
        const sync = await adb().sync();
        try {
          await sync.write({
            filename: TMP_APK,
            file: new Blob([ctx.apk]).stream(),
            permission: 0o644,
          });
        } finally {
          await sync.dispose();
        }
      },
    },
    {
      id: "install", key: "install.step.install", required: true,
      async run(ctx) {
        const out = await shell(["pm", "install", "-r", TMP_APK]);
        if (!/^Success/m.test(out)) throw new Error(out.trim() || "pm install returned no Success");
      },
    },
    {
      id: "cluster", key: "install.step.cluster", required: false,
      async run() {
        // Reinstall kills the instrument cluster's binder to ClusterNavService.
        await shell(["am", "crash", "com.autolink.instrument"]);
      },
    },
    {
      id: "appops", key: "install.step.appops", required: true,
      async run() {
        await shell(["appops", "set", PKG, "SYSTEM_ALERT_WINDOW", "allow"]);
        await shell(["appops", "set", PKG, "PROJECT_MEDIA", "allow"]);
        await shell(["appops", "set", PKG, "REQUEST_INSTALL_PACKAGES", "allow"]);
        try { await shell(["appops", "set", PKG, "USE_FULL_SCREEN_INTENT", "allow"]); }
        catch { log("  – USE_FULL_SCREEN_INTENT: " + t("install.skipped", "skipped")); } // old firmware
      },
    },
    {
      id: "runtime", key: "install.step.runtime", required: false,
      async run() {
        for (const p of RUNTIME_PERMS) {
          try { await shell(["pm", "grant", PKG, p]); }
          catch (e) { log(`  – ${p.split(".").pop()}: ${String(e.message).slice(0, 80)}`); }
        }
      },
    },
    {
      id: "carperms", key: "install.step.carperms", required: false,
      async run() {
        for (const p of CAR_PERMS) {
          try { await shell(["pm", "grant", PKG, p]); }
          catch (e) { log(`  – ${p.split(".").pop()}: ${String(e.message).slice(0, 80)}`); }
        }
      },
    },
    {
      id: "notif", key: "install.step.notif", required: false,
      async run() {
        await shell(["cmd", "notification", "allow_listener", `${PKG}/.MediaNotificationListener`]);
        await shell(["appops", "set", PKG, "WRITE_SETTINGS", "allow"]);
        await shell(["appops", "set", PKG, "ACCESS_RESTRICTED_SETTINGS", "allow"]);
      },
    },
    {
      id: "accessibility", key: "install.step.accessibility", required: false, optionalToggle: true,
      async run() {
        // Only when the user opts in — not everyone wants the nav-bar back button.
        await shell(["settings", "put", "secure", "enabled_accessibility_services", `${PKG}/.NavBarBackButtonService`]);
        await shell(["settings", "put", "secure", "accessibility_enabled", "1"]);
      },
    },
    {
      id: "autostart", key: "install.step.autostart", required: true,
      async run() {
        await shell(["dumpsys", "deviceidle", "whitelist", "+" + PKG]);
        await shell(["pm", "enable", `${PKG}/.BootReceiver`]);
      },
    },
    {
      // Give the app the browser's ADB identity so force-stop / split-screen
      // work locally with no PC. Same files install.sh pushes (README §Manual).
      id: "keys", key: "install.step.keys", required: false,
      async run() {
        const enc = new TextEncoder();
        const priv = enc.encode(await global.DMKeys.getPrivateKeyPem());
        const pub = enc.encode(await global.DMKeys.getAndroidPublicKey());
        const sync = await adb().sync();
        try {
          await sync.write({ filename: "/data/local/tmp/adbkey", file: new Blob([priv]).stream(), permission: 0o600 });
          await sync.write({ filename: "/data/local/tmp/adbkey.pub", file: new Blob([pub]).stream(), permission: 0o644 });
        } finally {
          await sync.dispose();
        }
        await shell(["run-as", PKG, "mkdir", "-p", "./files"]);
        await shell(["run-as", PKG, "cp", "/data/local/tmp/adbkey", "./files/adbkey"]);
        await shell(["run-as", PKG, "cp", "/data/local/tmp/adbkey.pub", "./files/adbkey.pub"]);
        const ls = await shell(["run-as", PKG, "ls", "files/adbkey"]);
        if (!/adbkey/.test(ls)) throw new Error("run-as verification failed");
        try { await shell(["rm", "-f", "/data/local/tmp/adbkey", "/data/local/tmp/adbkey.pub"]); } catch { /* tmp files */ }
      },
    },
    {
      id: "launch", key: "install.step.launch", required: true,
      async run() {
        await shell(["am", "start", "-n", ACTIVITY]);
        try { await shell(["rm", "-f", TMP_APK]); } catch { /* temp file, harmless */ }
      },
    },
  ];

  // ── UI plumbing ──────────────────────────────────────────────────────
  let running = false;

  function stepEls() {
    const list = document.getElementById("installSteps");
    if (!list) return [];
    return [...list.children];
  }

  function setStepState(id, state, detail) {
    const el = stepEls().find((li) => li.dataset.step === id);
    if (!el) return;
    el.dataset.state = state; // css: pending/running/ok/warn/fail
    el.title = detail ?? "";
  }

  function setProgress(frac, label) {
    const bar = document.getElementById("dlBar");
    const txt = document.getElementById("dlLabel");
    const wrap = document.getElementById("dlWrap");
    if (txt && label) txt.textContent = label;
    if (bar) bar.value = frac;
    if (wrap) wrap.hidden = !(frac > 0 && frac < 1);
  }

  function renderChecklist(includeAccessibility, setupOnly = false) {
    const list = document.getElementById("installSteps");
    if (!list) return;
    list.innerHTML = "";
    for (const s of steps) {
      if (s.optionalToggle && !includeAccessibility) continue;
      if (setupOnly && INSTALL_ONLY_STEPS.has(s.id)) continue;
      const li = document.createElement("li");
      li.dataset.step = s.id;
      li.dataset.state = "pending";
      li.textContent = t(s.key, s.id);
      list.appendChild(li);
    }
  }

  const INSTALL_ONLY_STEPS = new Set(["download", "push", "install", "cluster"]);

  async function run(opts = {}) {
    if (running || global.DMDevice?.state?.mode !== "connected") return;
    running = true;
    const btn = document.getElementById("installBtn");
    if (btn) btn.disabled = true;
    document.getElementById("mirrorLink")?.setAttribute("hidden", "");
    setProgress(0, "");
    renderChecklist(document.getElementById("optAccessibility")?.checked ?? false, !!opts.setupOnly);
    const ctx = { localFile: null };

    log(t("install.start", "Install started"), "ok");
    let failed = false;
    for (const s of steps) {
      if (s.optionalToggle && !document.getElementById("optAccessibility")?.checked) continue;
      if (opts.setupOnly && INSTALL_ONLY_STEPS.has(s.id)) continue;
      setStepState(s.id, "running");
      try {
        await s.run(ctx);
        setStepState(s.id, "ok");
        log(`${t(s.key, s.id)}: ${t("install.ok", "OK")}`, "ok");
      } catch (e) {
        const msg = String(e?.message ?? e).slice(0, 200);
        if (s.required) {
          setStepState(s.id, "fail", msg);
          log(`${t(s.key, s.id)}: ${t("install.failed", "FAILED")} — ${msg}`, "err");
          failed = true;
          break;
        }
        setStepState(s.id, "warn", msg);
        log(`${t(s.key, s.id)}: ${t("install.skipped", "skipped")} — ${msg}`, "err");
      }
    }
    setProgress(0, "");
    if (!failed) log(t("install.done", "Setup complete — DisplayMirror is installed and running."), "ok");
    else log(t("install.aborted", "Install aborted — fix the failing step and press Install again."), "err");
    await global.DMDevice?.refreshInfo?.();
    running = false;
    if (btn && global.DMDevice?.state?.mode === "connected") btn.disabled = false;
  }

  // Manual APK (offline / source unreachable): the picked file is used by the
  // next Install press — shown as an indicator with a clear button.
  let pendingLocalFile = null;

  function updatePickedIndicator() {
    const wrap = document.getElementById("pickedWrap");
    const name = document.getElementById("pickedName");
    if (!wrap || !name) return;
    wrap.hidden = !pendingLocalFile;
    if (pendingLocalFile) name.textContent = `${t("install.fileSelected", "Selected APK")}: ${pendingLocalFile.name} (${(pendingLocalFile.size / 1048576).toFixed(1)} MB)`;
  }

  function init() {
    document.getElementById("installBtn")?.addEventListener("click", run);
    document.getElementById("apkFile")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      e.target.value = ""; // allow re-picking the same file later
      pendingLocalFile = f;
      updatePickedIndicator();
      log(`${t("install.usingFile", "APK selected")} — ${t("install.pressInstall", "press Install / Update to use it")}`, "ok");
    });
    document.getElementById("pickedClear")?.addEventListener("click", () => {
      pendingLocalFile = null;
      updatePickedIndicator();
    });
    // Enable/disable Install button with connection state.
    const upd = () => {
      const btn = document.getElementById("installBtn");
      if (btn) btn.disabled = running || global.DMDevice?.state?.mode !== "connected";
      const latestEl = document.getElementById("latestInfo");
      if (latestEl && global.DMDevice?.state?.mode === "connected" && !latestEl.textContent) {
        fetchLatest()
          .then((r) => { latestEl.textContent = t("install.latest", "Latest release") + ": " + r.version; })
          .catch(() => { latestEl.textContent = t("install.latestUnavailable", "Latest release unavailable — use a local APK"); });
      } else if (latestEl && global.DMDevice?.state?.mode !== "connected") {
        latestEl.textContent = "";
      }
      // Re-render only when idle — a running pipeline owns the checklist.
      if (!running) renderChecklist(document.getElementById("optAccessibility")?.checked ?? false);
    };
    document.addEventListener("dm-connected", upd);
    document.addEventListener("dm-disconnected", upd);
    document.getElementById("optAccessibility")?.addEventListener("change", upd);
    upd();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.DMInstaller = { run, runSetup: () => run({ setupOnly: true }), fetchLatest, steps };
})(typeof window !== "undefined" ? window : globalThis);
