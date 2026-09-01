# WebInstaller — DisplayMirror one-click web installer

**Goal:** a public website (like <https://unlokit.net/>) that lets a Jetour G700 owner
install **DisplayMirror** onto the head unit **directly from Chrome** — no PC tools, no
ADB CLI, no `install.sh`. Everything runs client-side in the browser over
**WebUSB + ADB**; nothing is uploaded to any server.

This folder is a standalone project in the monorepo (own git repo, like
`DisplayMirror/`, `CarKeyCompanion/`, `CloudRelay/`).

---

## 1. What the reference site does (research notes)

Captured from unlokit.net on 2026-09-01 (working notes live in
`docs/reference-unlokit.md` once written up):

- **Architecture:** one static `index.html` + a self-contained, committed
  esbuild bundle (`unlokit-engine.bundle.js`, ~77 KB) exporting the
  **@yume-chan/adb ("Tango") WebADB** modules:
  `Adb`, `AdbDaemonTransport`, `AdbDaemonWebUsbDeviceManager`,
  `AdbWebCredentialStore`, `PackageManager`, `ActivityManager`, `IntentBuilder`,
  `adbGeneratePublicKey`, `encodeBase64`, `unzipSync` (fflate, for .xapk/.apkm).
  **No CDN at runtime, no backend.**
- **Browser support:** WebUSB ⇒ Chrome/Chromium only (desktop or Android).
  Brave needs Shields lowered. Page runs live checks on load: engine loaded,
  secure context (HTTPS), browser support, WebUSB permission state.
- **G700 ADB enable flow (the part every user must do once):**
  1. Bluetooth **OFF**, open the car's Phone app, dial an engineer code to open
     the hidden ADB menu.
  2. Plug a **data** USB cable into the **upper driver-side USB-A port**
     (USB-A↔USB-A from a PC, or OTG adapter from a phone).
  3. Enter a **time-based 6-digit code** in the car menu (derived from the car's
     clock — the page shows a region/timezone picker, the resulting date/hour,
     and a countdown to the next code rotation).
  4. Turn **ADB ON** (replug if the USB light blinks off), then press CONNECT in
     the browser and approve the RSA prompt on the car screen.
- **Engineer-code algorithm** (reimplemented from their client-side JS — it is a
     property of the car firmware, not of the site):

  ```
  code(mm, dd, hh, seed) = (( seed * (mm*10000 + dd*100 + hh) − hh ) mod 10^6)  // zero-padded 6 digits
  ```

  with mm/dd/hh taken in the **car's local timezone** (hh = 0–23):

  | Firmware | How the menu opens                       | Code seed    | Rotates? |
  |----------|------------------------------------------|--------------|----------|
  | 3.30–3.35 | dial fixed `*#20240730#*`               | `20250530`   | (verify) |
  | 3.36–3.37+ | dial `*#<code>#*` — dial code and menu password are the **same** code | `20251030` | hourly |

  ⚠️ Vectors must be re-verified against the live site and on the car during
  Phase 4 before shipping; treat the seeds as config data, not constants.
- **Their feature set:** device info panel, one-tap installs (they already
  feature DisplayMirror!), custom APK sideload (.apk/.xapk/.apkm/.apks),
  batch install, bulk permission grants, installed-apps list + uninstall,
  command console with presets, DRM/Google-services readiness checks, activity
  log, 4 languages (EN/AR/RU/ZH, RTL-aware), Telegram community links.

**Our scope is deliberately narrower:** one app — DisplayMirror — done perfectly,
with its full permission/autostart/key setup automated. (General app library /
console can be a v2; see §9.)

**Originality note:** do **not** copy unlokit's HTML/CSS/copy/assets. We write
our own UI and text, and reimplement only the factual firmware behavior (dial
code + code math). Footer credits unlokit for pioneering the flow.

---

## 2. Target user flow (site structure)

1. **Hero + status bar** — title, "works in Chrome" badges, live checks
   (HTTPS ✓, WebUSB ✓, browser ✓, engine ✓). If not Chrome/secure context →
   friendly gate with instructions.
2. **Step 1 — "Enable ADB once" card** — firmware picker (3.30–3.35 /
   3.36–3.37+), region↔timezone picker, big live **6-digit code** with
   countdown to the next hourly rotation, dial-code display, illustrated steps
   (Bluetooth off → Phone app → dial → plug upper-left USB-A → enter code →
   ADB ON), troubleshooting accordion (clock mismatch, cable types, replug).
3. **Step 2 — Connect card** — big CONNECT button → WebUSB device picker →
   "Approve on the car screen" → connected state. Auto-reconnect handling on
   unplug/replug.
4. **Device panel** — Model (`ro.product.model`), Android version, firmware
   (`ro.build.display.id`), serial, DisplayMirror installed version (via
   `dumpsys package`) vs latest GitHub release → "new version available" badge.
5. **Step 3 — Install / Update card** — one button. Runs the full pipeline
   (§4) with a live checklist (each step: pending / running / ✓ / ⚠ tolerated /
   ✗ failed + retry). Ends with "DisplayMirror launched 🎉".
6. **Tools card** — Update check, Re-run setup (permissions/autostart only),
   Push ADB keys (standalone), Kill-switch toggles (`displaymirror_noboot`),
   Uninstall, Diagnostics dump (getprop set → copyable).
7. **Activity log** — timestamped, copy/copy-errors/clear, persisted per session.
8. **Footer** — credits (DisplayMirror repo, unlokit inspiration), licenses,
   "park safely / don't use while driving" note.

Languages: **EN + AR (RTL)** at launch; RU/ZH as stretch (same `data-i18n`
dictionary pattern as the rest of the monorepo's minimalism).

---

## 3. Architecture

**Pure static site, zero framework, no backend.** Matches monorepo conventions
(minimal deps, vanilla JS). Only build-time tool: Node + esbuild to bundle the
WebADB engine; the resulting `vendor/dm-engine.bundle.js` is **committed**, so
serving the site never requires a build step.

```
WebInstaller/
├── index.html              # single page, sections above
├── css/style.css           # dark utility theme, RTL-aware (logical CSS props)
├── js/
│   ├── i18n.js             # dictionaries + dir=rtl switch + persistence
│   ├── status.js           # browser / secure-context / WebUSB / engine checks
│   ├── codegen.js          # G700 engineer code (pure function, no DOM)
│   ├── device.js           # WebUSB connect, AdbDaemonTransport, device info,
│   │                       #   disconnect/reconnect handling
│   ├── installer.js        # APK fetch + install + setup-step runner (§4)
│   ├── keys.js             # extractable credential store + key push (§5)
│   ├── tools.js            # update check, kill switches, uninstall, dump
│   └── log.js              # activity log
├── vendor/
│   └── dm-engine.bundle.js # committed esbuild bundle of @yume-chan/adb + webusb
├── scripts/
│   ├── build-engine.mjs    # esbuild config (rebuild when upgrading lib)
│   └── test-codegen.mjs    # node unit test: code vectors + edge cases
├── docs/
│   └── reference-unlokit.md  # research notes, algorithm, credits
├── package.json            # devDependencies only (esbuild, @yume-chan/*)
├── AGENTS.md               # project guide for coding agents
├── PLAN.md                 # this file
└── .gitignore
```

**Key libraries (pinned at Phase 0):** `@yume-chan/adb` + `@yume-chan/adb-daemon-webusb`
(v2.x — latest confirmed on npm 2026-09-01: adb 2.6.3 / webusb 2.3.2; verify & pin exact).
No fflate needed (we install a single plain .apk).

**APK source:** GitHub Releases — `GET api.github.com/repos/Baghdady92/DisplayMirror/releases/latest`
(CORS-enabled) → latest `DisplayMirror-v*.apk` browser_download_url → streamed
to the installer with a progress bar. Fallback: "choose APK file" picker for
offline/GitHub-outage cases. The APK never touches any server we run.

**Hosting:** GitHub Pages (`https://baghdady92.github.io/...` or a dedicated
repo `WebInstaller` / custom domain later). HTTPS ⇒ secure context ⇒ WebUSB
works. Deploy = push to `gh-pages`/`main` per Pages config.

**Config-as-code:** a single `js/config.js` (or top-of-installer constants) holds
`REPO`, `PACKAGE=com.example.displaymirror`, `ACTIVITY`, and the setup-step
table — mirroring `DisplayMirror/install.sh`. **Sync rule:** any change to
`install.sh` / `make setup` must be mirrored here (add to both AGENTS.md files).

---

## 4. Install pipeline (exact commands)

Mirrors `DisplayMirror/install.sh` + `Makefile setup` (superset). Every step is
`required` or `tolerant` (ⓘ tolerated = warned, never blocks). Runner executes
over the WebADB shell, streams output to the activity log, supports per-step
retry and "re-run setup" for the permissions block only.

| # | Step | Command(s) | Mode |
|---|------|-----------|------|
| 1 | Download latest APK | GitHub API → stream (progress bar) | required |
| 2 | Install APK | Tango `PackageManager.install()` streaming; fallback: sync-write to `/data/local/tmp/dm.apk` + `pm install -r` (+ `rm` after) | required |
| 3 | Rebind instrument cluster | `am crash com.autolink.instrument` | tolerant (G700-only, after fresh install) |
| 4 | AppOps | `appops set PKG SYSTEM_ALERT_WINDOW allow` · `PROJECT_MEDIA allow` · `REQUEST_INSTALL_PACKAGES allow` · `USE_FULL_SCREEN_INTENT allow` | first 3 required, last tolerant |
| 5 | Runtime perms | `pm grant PKG android.permission.{READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW, ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION, HIGH_SAMPLING_RATE_SENSORS}` | each tolerant |
| 6 | Car perms | `pm grant PKG android.car.permission.{CAR_SPEED, CAR_ENERGY, CAR_ENGINE_DETAILED, CAR_POWERTRAIN, CAR_TIRES, CAR_INFO, CAR_EXTERIOR_ENVIRONMENT, CAR_MILEAGE, CAR_VENDOR_EXTENSION, CAR_DYNAMICS_STATE, CONTROL_CAR_CLIMATE, READ_CAR_DISPLAY_UNITS, CAR_DRIVING_STATE}` | each tolerant |
| 7 | Notification listener | `cmd notification allow_listener PKG/.MediaNotificationListener` | tolerant |
| 8 | Extra appops | `appops set PKG WRITE_SETTINGS allow` · `ACCESS_RESTRICTED_SETTINGS allow` | tolerant |
| 9 | Back-button service | `settings put secure enabled_accessibility_services PKG/.NavBarBackButtonService` + `settings put secure accessibility_enabled 1` | tolerant, behind an opt-in toggle (only for cars that want the nav-bar back button) |
| 10 | Autostart | `dumpsys deviceidle whitelist +PKG` · `pm enable PKG/.BootReceiver` | required |
| 11 | ADB keys | see §5 | tolerant (warn: force-stop/split-screen need it) |
| 12 | Launch | `am start -n PKG/.MainActivity` | required |

Notes:
- `install -r` cannot **downgrade** — if installed versionCode > release, offer
  "Uninstall first (loses app data)" path in Tools.
- Update flow = same pipeline (steps 1–2 + 10–12); app data is preserved.

---

## 5. ADB key provisioning (force-stop / split-screen enabler)

DisplayMirror acts as a **local ADB client** on the head unit using a keypair in
its own files (`files/adbkey[.pub]`, auto-imported; see DisplayMirror README
"Manual Install & Setup"). The website provisions it:

1. Implement a **custom credential store** for the WebADB transport (same
   interface the library expects) that generates an **extractable** RSA-2048
   WebCrypto keypair, persisted in IndexedDB — so the browser session and the
   exported keypair are the **same identity**.
2. Export: private → PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`), public →
   Android adb public-key format (library exposes an
   `adbGeneratePublicKey`-style helper; otherwise implement the payload).
3. Push via ADB sync-write to `/data/local/tmp/adbkey[.pub]`, then
   `run-as PKG mkdir -p ./files` + `run-as PKG cp …` (same as install.sh).
4. Verify: `run-as PKG ls files/adbkey` → ✓ in UI.

Why same-identity matters: if the head unit's adbd is **secure**, the car-screen
approval ("always allow") authorizes exactly our public key — the app's local
connections then pass too. If adbd is **insecure** (common on these units once
ADB is toggled on), any key works and this is still correct. Verify which mode
the G700 runs in during Phase 3 (on-car).

---

## 6. Engineer-code module (`js/codegen.js`)

Pure, dependency-free, unit-tested:

```js
export function engineerCode({ mm, dd, hh, seed }) {
  const n = BigInt(seed) * BigInt(mm*10000 + dd*100 + hh) - BigInt(hh);
  return (((n % 1000000n) + 1000000n) % 1000000n).toString().padStart(6, "0");
}
```

- Firmware table `{label, seed, dial, dynamic}` from §1 as **config data**.
- UI side: region→timezone map (Intl), live clock in that tz, manual hour
  override, countdown "code changes in mm:ss", big type-in-able display.
- Tests (`scripts/test-codegen.mjs`): fixed vectors — during implementation,
  capture 3–4 expected codes from the live reference site for known
  date/hour/seed and hard-assert them, then confirm on the car.

---

## 7. Phases & acceptance criteria

| Phase | Deliverable | Acceptance |
|-------|-------------|-----------|
| **0. Scaffold** | Folder/git (done), skeleton `index.html`+css, i18n shell, engine bundle build script, package.json, AGENTS.md, deployed placeholder on GitHub Pages | Site loads over HTTPS; status checks pass in Chrome; bundle exposes the Adb modules |
| **1. Connect** | WebUSB connect flow, custom extractable credential store, device info panel, activity log, reconnect handling | Connect to a real head unit (or any Android w/ USB debugging); device info renders; unplug/replug recovers |
| **2. Install (MVP)** | APK download + streaming install + full §4 pipeline with checklist UI + launch | Fresh G700 goes from stock → DisplayMirror running, all required steps ✓, with one button and zero commands |
| **3. Keys** | §5 key push + verification | `run-as … ls files/adbkey` ✓; app's force-stop / split-screen work on the car afterwards |
| **4. ADB-enable guide** | codegen module + firmware/region pickers + step-by-step + troubleshooting, EN/AR | Codes match live reference vectors; a first-time owner can enable ADB using only the page |
| **5. Tools** | Update check/badge, re-run setup, kill-switch toggles, uninstall, diagnostics dump | All tools work on-car; update badge reflects GitHub latest |
| **6. Polish & ship** | RTL pass, mobile/OTG UX pass, branding, README + docs, root AGENTS.md updated, publish | Full happy-path walkthrough on the real car in EN and AR; Lighthouse ≥ 95; footer credits |

MVP for real users = Phases 0–2 (guide text can be simpler markdown initially).

---

## 8. Testing & risk register

**Testing** (no emulator for WebUSB — hardware required):
- Unit (Node): codegen vectors, step-table sanity.
- Desktop Chrome (macOS/Windows) + USB-A↔USB-A cable to the car.
- Chrome on Android phone + OTG adapter (the phone-only install path — a key
  unlokit differentiator we must support).
- Any spare Android device + USB debugging = stand-in for connect/install/perm
  steps (car-only steps tolerate-fail).
- Manual matrix documented in README; nightly-ish re-check when firmware or the
  @yume-chan libs update.

**Risks / open questions:**
| Risk | Mitigation |
|------|-----------|
| adbd secure vs insecure on G700 (affects key story) | Same-identity keys (§5) correct in both; verify on-car in Phase 3 |
| Firmware 3.38+ may change seeds/menu | Seeds + dial strings are config; site updatable without app release |
| `install -r` downgrade refusal | Detect versionCode, offer uninstall-first flow with data-loss warning |
| GitHub API rate limit (60/hr/IP) for release lookup | Cache in localStorage; manual-file fallback |
| WebUSB flakiness on some Android phones/OTG cables | Cable guidance copy; replug detection + retry |
| Brave/Firefox/Safari users | Clear gate messaging: "Open in Chrome" (deep-link/QR) |
| Users driving while using | Static safety notices; no interaction while ignition on is unenforceable — disclaimers only |
| unmaintained bundle drift | Pin versions; `scripts/build-engine.mjs` documented; renovate-style manual check each release |

---

## 9. Out of scope (v2 candidates)

General app library / batch installs, custom APK + .xapk/.apkm sideloading,
free-form shell console (beyond diagnostics presets), Widevine/DRM checks,
multi-model support (G900/T2/…), PWA offline caching beyond the shell, any
backend/analytics. The site stays a dumb, private, client-side installer.

---

## 10. Decisions already made (change here if revisited)

- Folder: `WebInstaller/`, own git repo, static vanilla JS site, no framework.
- Library: @yume-chan/adb (Tango) bundled & committed; rebuild only on upgrade.
- Hosting: GitHub Pages, HTTPS-only; custom domain optional later.
- Languages at launch: EN + AR (RTL); RU/ZH stretch.
- Brand/working title: **"DisplayMirror Installer"** — tagline:
  *"Install DisplayMirror on your Jetour G700 — right from Chrome. No PC, no commands."*
- Original UI and copy only; unlokit credited for the flow, algorithm
  reimplemented from firmware behavior.
