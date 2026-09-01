# DisplayMirror Web Installer

**https://baghdady92.github.io/WebInstaller/**

A static website that installs [DisplayMirror](https://github.com/Baghdady92/DisplayMirror)
onto a Jetour G700 head unit **directly from Chrome** — no PC tools, no ADB CLI,
no `install.sh`. Everything runs client-side in the browser over WebUSB + ADB;
nothing is uploaded to any server.

Install-flow inspiration: [unlokit.net](https://unlokit.net/) — this site is a
dedicated, first-party installer for DisplayMirror with its full setup automated.

## What it does

1. **Enable ADB (once)** — firmware + region pickers, the live time-based
   engineer-menu code (rotates hourly) and the dial code, step-by-step guide
   and troubleshooting, in English and Arabic.
2. **Connect** — Chrome's WebUSB device picker → ADB handshake → device panel
   (model, Android, firmware, serial, installed app version). Cable unplug is
   detected automatically.
3. **Install / Update** — one click downloads the latest APK from GitHub
   Releases, installs it (`pm install -r`), grants every runtime / special /
   vehicle permission, enables auto-start, provisions ADB keys (so force-stop
   and split-screen work with no PC) and launches the app. Live per-step
   checklist; a "use a local APK" fallback covers offline installs.
4. **Tools** — update check, re-run setup, the autostart kill switch (same
   file as `make kill-boot`), uninstall, and a copyable diagnostics report.

## Browser support

Chrome / Chromium only (desktop or Android) — WebUSB is required. Must be
served over HTTPS (or localhost). Brave needs Shields lowered for WebUSB.

## Development

```bash
npm install        # dev deps only: esbuild + @yume-chan/adb packages
npm test           # unit tests: engineer-code math, key DER encoding round-trip
npm run build:engine   # rebuild vendor/dm-engine.bundle.js (only when upgrading libs)
npx serve .        # local server (localhost is a secure context — WebUSB works)
```

`vendor/dm-engine.bundle.js` is committed, so serving the site never requires
a build step. No framework, no runtime CDN, no backend. Deploy = push to
`master` (GitHub Pages).

## Security & privacy

- The site is a dumb client-side installer: it talks only to the car over USB
  and to GitHub's public API for release metadata.
- The browser's ADB keypair (RSA-2048) is generated locally, stored in
  IndexedDB, and pushed to DisplayMirror's private files so the app can act as
  a local ADB client. It never leaves your devices.
- The activity log and diagnostics report contain the device serial number —
  strip them before sharing publicly.

## Sync rules

The install pipeline in `js/installer.js` mirrors `DisplayMirror/install.sh`
and the `setup:` target in `DisplayMirror/Makefile`. If either changes, update
this site in the same commit (and vice versa). See [AGENTS.md](AGENTS.md) and
[PLAN.md](PLAN.md) for architecture details.

**APK distribution:** downloads use `apks/` in this repo (served by
`raw.githubusercontent.com` — CORS-enabled, no rate limits), NOT GitHub
release assets (no CORS) and not the GitHub API (rate-limited). When you
publish a new DisplayMirror release:

1. Copy the APK in as `apks/DisplayMirror-v<VERSION>.apk`
2. Update `apks/latest.json` (version, versionCode, size, sha256, date)
3. Update the pinned `MIRROR` URL in `js/installer.js`
4. Remove APK files older than the current version
