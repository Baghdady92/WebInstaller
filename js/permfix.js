// "Fix app permissions" card — sideloaded apps land on the head unit with
// every permission denied and no reachable UI to allow them (the car's
// Settings hides the app list, and Android 13+ blocks "restricted settings"
// for apps installed outside the store). This grants, for one app or for all
// user-installed apps: every runtime permission the app declares, plus the
// special app-ops that have no on-screen toggle here.
//
// Only the app's own declared permissions are touched — nothing is granted to
// an app that never asked for it.
(function (global) {
  "use strict";

  const ALL = "__all__";
  const PKG_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

  // Special app-ops, each keyed by the manifest permission that makes it
  // relevant. An op is only flipped when the app declares one of its triggers.
  const OP_TRIGGERS = {
    SYSTEM_ALERT_WINDOW: ["android.permission.SYSTEM_ALERT_WINDOW"],
    REQUEST_INSTALL_PACKAGES: ["android.permission.REQUEST_INSTALL_PACKAGES"],
    WRITE_SETTINGS: ["android.permission.WRITE_SETTINGS"],
    GET_USAGE_STATS: ["android.permission.PACKAGE_USAGE_STATS"],
    MANAGE_EXTERNAL_STORAGE: ["android.permission.MANAGE_EXTERNAL_STORAGE"],
    LEGACY_STORAGE: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    PROJECT_MEDIA: [
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
      "android.permission.CAPTURE_VIDEO_OUTPUT",
    ],
    USE_FULL_SCREEN_INTENT: ["android.permission.USE_FULL_SCREEN_INTENT"],
  };

  // Tried for every app: unblocks the Android 13+ "Restricted setting" dialog
  // (accessibility / notification listener for sideloaded apps) and the OEM
  // background-execution clamp. Missing on older firmware — failures are
  // logged, not counted as errors.
  const ALWAYS_OPS = ["ACCESS_RESTRICTED_SETTINGS", "RUN_IN_BACKGROUND", "RUN_ANY_IN_BACKGROUND"];

  function log(msg, cls) { global.DMLog?.log(msg, cls); }
  function t(key, fallback) { return global.DMI18n ? global.DMI18n.t(key) : (fallback ?? key); }
  function connected() { return global.DMDevice?.state?.mode === "connected"; }

  function shell(cmd) {
    const a = global.DMDevice?.state?.adb;
    if (!a) throw new Error(t("install.notConnected", "Not connected"));
    return a.subprocess.noneProtocol.spawnWaitText(cmd);
  }

  let running = false;
  // Set of runtime-grantable permissions; null = unavailable (try everything),
  // undefined = not fetched yet for this connection.
  let dangerousCache;

  // ── Device queries ───────────────────────────────────────────────────
  async function listPackages() {
    const out = await shell(["pm", "list", "packages", "-3"]);
    return out.split("\n")
      .map((l) => l.replace("package:", "").trim())
      .filter((p) => PKG_RE.test(p))
      .sort();
  }

  // Only "dangerous" permissions can be granted at runtime; install-time ones
  // are already held and error out. Cached per connection.
  async function dangerousPerms() {
    if (dangerousCache !== undefined) return dangerousCache;
    try {
      const out = await shell(["pm", "list", "permissions", "-d"]);
      const set = new Set();
      for (const line of out.split("\n")) {
        const m = /^\s*permission:(\S+)\s*$/.exec(line);
        if (m) set.add(m[1]);
      }
      dangerousCache = set.size ? set : null; // empty → fall back to "try all"
    } catch {
      dangerousCache = null;
    }
    return dangerousCache;
  }

  // Permissions listed under "requested permissions:" in `dumpsys package`.
  // Lines may carry a suffix (": restricted=true"); the block ends at the
  // first line that isn't a bare permission name.
  function parseRequested(dump) {
    const out = new Set();
    let inBlock = false;
    for (const raw of dump.split("\n")) {
      const line = raw.trim();
      if (line === "requested permissions:") { inBlock = true; continue; }
      if (!inBlock) continue;
      const name = line.split(":")[0].trim();
      if (PKG_RE.test(name)) out.add(name);
      else inBlock = false;
    }
    return out;
  }

  // Shell statements, joined into as few round trips as stay comfortably
  // under adbd's service-string limit (~1 KB on older builds).
  const MAX_CMD = 800;

  async function runChunked(parts) {
    let out = "";
    let batch = [];
    let len = 0;
    for (const part of parts) {
      if (batch.length && len + part.length + 2 > MAX_CMD) {
        out += await shell(batch.join("; ")) + "\n";
        batch = [];
        len = 0;
      }
      batch.push(part);
      len += part.length + 2;
    }
    if (batch.length) out += await shell(batch.join("; "));
    return out;
  }

  // ── One app ──────────────────────────────────────────────────────────
  async function fixOne(pkg) {
    // Package names end up inside a compound shell command — never take one
    // that isn't a plain package name.
    if (!PKG_RE.test(pkg)) throw new Error(`Invalid package name: ${pkg}`);
    const dump = await shell(["dumpsys", "package", pkg]);
    const requested = parseRequested(dump);
    const dangerous = await dangerousPerms();
    const perms = [...requested].filter((p) => !dangerous || dangerous.has(p));
    const ops = Object.keys(OP_TRIGGERS)
      .filter((op) => OP_TRIGGERS[op].some((p) => requested.has(p)))
      .concat(ALWAYS_OPS);

    const res = { pkg, granted: 0, refused: [], ops: 0, opsRefused: [] };
    if (!perms.length && !ops.length) return res;

    // Batched into a few compound commands: every grant reports its own
    // outcome, and no single `exec:` service string gets long enough to hit
    // an older adbd's command-length limit.
    const parts = [];
    for (const p of perms) parts.push(`pm grant ${pkg} ${p} >/dev/null 2>&1 && echo P+${p} || echo P-${p}`);
    for (const op of ops) parts.push(`appops set ${pkg} ${op} allow >/dev/null 2>&1 && echo O+${op} || echo O-${op}`);
    const out = await runChunked(parts);

    for (const line of out.split("\n")) {
      const s = line.trim();
      if (s.startsWith("P+")) res.granted++;
      else if (s.startsWith("P-")) res.refused.push(s.slice(2));
      else if (s.startsWith("O+")) res.ops++;
      else if (s.startsWith("O-")) res.opsRefused.push(s.slice(2));
    }
    return res;
  }

  // ── UI ───────────────────────────────────────────────────────────────
  function setResult(text, cls) {
    const el = document.getElementById("permResult");
    if (!el) return;
    el.textContent = text;
    el.className = "tool-result" + (cls ? " " + cls : "");
  }

  function addRow(pkg) {
    const list = document.getElementById("permList");
    if (!list) return null;
    const li = document.createElement("li");
    li.dataset.state = "running";
    li.textContent = pkg;
    list.appendChild(li);
    li.scrollIntoView({ block: "nearest" });
    return li;
  }

  function rowDone(li, res) {
    if (!li) return;
    const bits = [
      `${res.granted} ${t("perm.rowPerms", "perms")}`,
      `${res.ops} ${t("perm.rowOps", "toggles")}`,
    ];
    li.textContent = `${res.pkg} · ${bits.join(" · ")}`;
    li.dataset.state = res.granted + res.ops > 0 ? "ok" : "warn";
    const refused = res.refused.concat(res.opsRefused);
    if (refused.length) li.title = t("perm.refusedTip", "Refused") + ": " + refused.join(", ");
  }

  function setBusy(on) {
    running = on;
    const live = connected();
    for (const id of ["permRun", "permRefresh", "permTarget"]) {
      const el = document.getElementById(id);
      if (el) el.disabled = on || !live;
    }
  }

  async function refreshList(quiet) {
    const sel = document.getElementById("permTarget");
    if (!sel || !connected()) return;
    const keep = sel.value;
    try {
      const pkgs = await listPackages();
      sel.innerHTML = "";
      const all = document.createElement("option");
      all.value = ALL;
      all.textContent = `${t("perm.allApps", "All user-installed apps")} (${pkgs.length})`;
      sel.appendChild(all);
      for (const p of pkgs) {
        const o = document.createElement("option");
        o.value = p;
        o.textContent = p;
        sel.appendChild(o);
      }
      sel.value = pkgs.includes(keep) ? keep : ALL;
      if (!quiet) log(`${t("perm.listed", "User-installed apps found")}: ${pkgs.length}`, "ok");
      if (!pkgs.length) setResult(t("perm.noApps", "No user-installed apps on this unit"), "warn");
    } catch (e) {
      if (!quiet) log(t("perm.listFail", "Could not list apps") + ": " + String(e.message).slice(0, 120), "err");
    }
  }

  async function run() {
    if (running || !connected()) return;
    const sel = document.getElementById("permTarget");
    const target = sel?.value ?? ALL;

    let targets;
    if (target === ALL) {
      targets = await listPackages().catch(() => []);
      if (!targets.length) { setResult(t("perm.noApps", "No user-installed apps on this unit"), "warn"); return; }
      const msg = `${t("perm.confirmAll", "Grant every permission that each app asks for?")}\n\n${targets.length} ${t("perm.apps", "apps")}`;
      if (!window.confirm(msg)) return;
    } else {
      targets = [target];
    }

    setBusy(true);
    const list = document.getElementById("permList");
    if (list) list.innerHTML = "";
    setResult(t("perm.working", "Working…"), "");
    log(`${t("perm.start", "Fixing permissions for")} ${targets.length === 1 ? targets[0] : targets.length + " " + t("perm.apps", "apps")}…`);

    let apps = 0, granted = 0, ops = 0, failed = 0;
    for (const pkg of targets) {
      if (!connected()) { log(t("connect.disconnected", "USB device disconnected"), "err"); break; }
      const li = addRow(pkg);
      try {
        const res = await fixOne(pkg);
        rowDone(li, res);
        apps++;
        granted += res.granted;
        ops += res.ops;
        log(`  ${pkg}: ${res.granted} ${t("perm.rowPerms", "perms")}, ${res.ops} ${t("perm.rowOps", "toggles")}` +
            (res.refused.length ? ` (${res.refused.length} ${t("perm.refusedShort", "refused")})` : ""));
      } catch (e) {
        failed++;
        if (li) {
          li.dataset.state = "fail";
          li.title = String(e?.message ?? e).slice(0, 200);
        }
        log(`  ${pkg}: ${t("install.failed", "FAILED")} — ${String(e?.message ?? e).slice(0, 120)}`, "err");
      }
    }

    const summary = `${apps} ${t("perm.apps", "apps")} · ${granted} ${t("perm.summaryPerms", "permissions granted")} · ${ops} ${t("perm.summaryOps", "special toggles set")}` +
      (failed ? ` · ${failed} ${t("perm.summaryFailed", "failed")}` : "");
    setResult(summary, failed ? "warn" : "ok");
    log(t("perm.done", "Permission fix complete") + " — " + summary, failed ? "err" : "ok");
    setBusy(false);
  }

  function init() {
    document.getElementById("permRun")?.addEventListener("click", run);
    document.getElementById("permRefresh")?.addEventListener("click", () => refreshList(false));
    document.addEventListener("dm-connected", () => {
      dangerousCache = undefined;
      setBusy(false);
      refreshList(true);
    });
    document.addEventListener("dm-disconnected", () => {
      dangerousCache = undefined;
      setBusy(false);
    });
    // The app list is built at runtime, so the "all apps" row carries no
    // data-i18n attribute for the global re-render to pick up.
    document.addEventListener("dm-lang-changed", () => {
      const all = document.getElementById("permTarget")?.querySelector(`option[value="${ALL}"]`);
      if (!all) return;
      const n = document.getElementById("permTarget").options.length - 1;
      all.textContent = t("perm.allApps", "All user-installed apps") + (n > 0 ? ` (${n})` : "");
    });
    setBusy(false);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.DMPermFix = { run, refreshList, fixOne, parseRequested, OP_TRIGGERS, ALWAYS_OPS };
})(typeof window !== "undefined" ? window : globalThis);
