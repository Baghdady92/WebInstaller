// Tools card: update check, re-run setup, autostart kill switch,
// uninstall, diagnostics dump. All require a connected device.
(function (global) {
  "use strict";

  const PKG = "com.example.displaymirror";
  const KILLSWITCH = "/data/local/tmp/displaymirror_noboot";

  function log(msg, cls) { global.DMLog?.log(msg, cls); }
  function t(key, fallback) { return global.DMI18n ? global.DMI18n.t(key) : (fallback ?? key); }
  function connected() { return global.DMDevice?.state?.mode === "connected"; }
  function shell(args) { return global.DMDevice.state.adb.subprocess.noneProtocol.spawnWaitText(args); }

  function setEnabled(id, on) {
    const el = document.getElementById(id);
    if (el) el.disabled = !on;
  }

  function setAll(on) {
    ["checkUpdate", "rerunSetup", "killSwitchBtn", "uninstallBtn", "diagBtn"].forEach((id) => setEnabled(id, on));
    if (on) refreshKillSwitch();
  }

  // ── Update check ─────────────────────────────────────────────────────
  async function checkUpdate() {
    try {
      const [rel, dump] = await Promise.all([
        global.DMInstaller.fetchLatest(),
        shell(["dumpsys", "package", PKG]).catch(() => ""),
      ]);
      const m = /versionName=([^\s]+)/.exec(dump);
      const el = document.getElementById("updateResult");
      if (!m) {
        el.textContent = t("tools.update.none", "DisplayMirror is not installed");
        el.className = "tool-result warn";
        return;
      }
      const installed = m[1].replace(/^v/, "");
      const latest = rel.version.replace(/^v/, "");
      if (installed === latest) {
        el.textContent = t("tools.update.same", "Up to date") + ` (v${installed})`;
        el.className = "tool-result ok";
        log(t("tools.update.same", "Up to date") + ` v${installed}`, "ok");
      } else {
        el.textContent = `${t("tools.update.available", "Update available")}: v${installed} → v${latest}`;
        el.className = "tool-result warn";
        log(`${t("tools.update.available", "Update available")}: v${installed} → v${latest} — ${t("tools.update.hint", "use Install / Update in step 3")}`, "ok");
      }
    } catch (e) {
      const el = document.getElementById("updateResult");
      el.textContent = t("tools.update.fail", "Check failed") + ": " + String(e.message).slice(0, 120);
      el.className = "tool-result err";
    }
  }

  // ── Kill switch (survives reinstall — same file as `make kill-boot`) ──
  let killOn = null;

  async function refreshKillSwitch() {
    try {
      const out = await shell(["test", "-f", KILLSWITCH, "&&", "echo", "yes"]);
      killOn = out.trim() === "yes";
    } catch {
      killOn = false; // `test` returns non-zero exit for missing file → throw
    }
    const btn = document.getElementById("killSwitchBtn");
    if (btn) {
      btn.textContent = killOn
        ? t("tools.kill.enable", "Allow auto-start on boot")
        : t("tools.kill.disable", "Stop auto-start on boot (kill switch)");
    }
    const st = document.getElementById("killSwitchState");
    if (st) {
      st.textContent = killOn
        ? t("tools.kill.stateOff", "Auto-start is BLOCKED by the kill switch")
        : t("tools.kill.stateOn", "Auto-start allowed");
      st.className = "tool-result " + (killOn ? "warn" : "ok");
    }
  }

  async function toggleKillSwitch() {
    try {
      if (killOn) await shell(["rm", "-f", KILLSWITCH]);
      else await shell(["touch", KILLSWITCH]);
      log(killOn ? t("tools.kill.enabled", "Kill switch removed — app will auto-start on boot") : t("tools.kill.disabled", "Kill switch set — app will NOT auto-start"), "ok");
      await refreshKillSwitch();
    } catch (e) {
      log(t("connect.failed", "Failed") + ": " + String(e.message).slice(0, 120), "err");
    }
  }

  // ── Uninstall ────────────────────────────────────────────────────────
  async function uninstall() {
    if (!window.confirm(t("tools.uninstall.confirm", "Uninstall DisplayMirror from the car? App data will be lost."))) return;
    try {
      const out = await shell(["pm", "uninstall", PKG]);
      log("pm uninstall: " + out.trim(), /Success/i.test(out) ? "ok" : "err");
      await global.DMDevice?.refreshInfo?.();
    } catch (e) {
      log(t("connect.failed", "Failed") + ": " + String(e.message).slice(0, 120), "err");
    }
  }

  // ── Diagnostics dump ─────────────────────────────────────────────────
  const DIAG_PROPS = [
    "ro.product.model", "ro.product.device", "ro.build.version.release",
    "ro.build.version.sdk", "ro.build.display.id", "ro.build.fingerprint",
    "persist.sys.timezone", "ro.serialno",
  ];

  async function diagnostics() {
    const lines = [`# ${new Date().toISOString()}`];
    for (const p of DIAG_PROPS) {
      lines.push(`${p}=${await global.DMDevice.state.adb.getProp(p).catch(() => "?")}`);
    }
    const dump = lines.join("\n");
    const el = document.getElementById("diagOut");
    if (el) {
      el.textContent = dump;
      el.hidden = false;
    }
    log(t("tools.diag.done", "Diagnostics collected — shown below; copy before sharing (contains the serial number)"), "ok");
    try {
      await navigator.clipboard.writeText(dump);
      log(t("tools.diag.copied", "Copied to clipboard"), "ok");
    } catch { /* manual copy from the box */ }
  }

  function init() {
    document.getElementById("checkUpdate")?.addEventListener("click", checkUpdate);
    document.getElementById("rerunSetup")?.addEventListener("click", () => global.DMInstaller?.runSetup());
    document.getElementById("killSwitchBtn")?.addEventListener("click", toggleKillSwitch);
    document.getElementById("uninstallBtn")?.addEventListener("click", uninstall);
    document.getElementById("diagBtn")?.addEventListener("click", diagnostics);
    document.addEventListener("dm-connected", () => setAll(true));
    document.addEventListener("dm-disconnected", () => setAll(false));
    setAll(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.DMTools = { checkUpdate, diagnostics };
})(typeof window !== "undefined" ? window : globalThis);
