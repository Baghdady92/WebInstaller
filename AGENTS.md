# AGENTS.md — WebInstaller

Static website that installs **DisplayMirror** onto a Jetour G700 head unit
directly from Chrome via **WebUSB + ADB** (client-side only, no backend).
Modeled on the flow popularized by unlokit.net but scoped to DisplayMirror and
written from scratch — **read [`PLAN.md`](PLAN.md) first**; it contains the full
architecture, the exact install/setup command pipeline, the G700 engineer-code
algorithm, phases, and the risk register.

## Stack & conventions

- Pure vanilla HTML/CSS/JS. **No framework, no runtime CDN, no backend.**
- WebADB engine: `vendor/dm-engine.bundle.js` — a **committed** esbuild bundle
  of `@yume-chan/adb` + `@yume-chan/adb-daemon-webusb` (devDependencies only).
  Rebuild with `node scripts/build-engine.mjs` (requires `npm install`); only
  commit a new bundle when intentionally upgrading the library.
- Must be served over **HTTPS** (WebUSB needs a secure context). Local dev:
  `python3 -m http.server` is NOT enough — use `npx serve` / any https proxy,
  or test on the deployed GitHub Pages URL.
- i18n: `js/i18n.js` dictionaries, `data-i18n` attributes; EN + AR (RTL) are
  first-class. Use CSS logical properties (`margin-inline-start`, not `left`).
- Unit tests: `npm test` — engineer-code vectors, ADB-key DER round-trip, and
  the `dumpsys package` permission parser (`scripts/test-permfix.mjs`).

## The permission fixer

`js/permfix.js` is the one part of the site that is **not** DisplayMirror-
specific: it grants any user-installed app everything its own manifest asks for
(runtime permissions + the app-ops the car's Settings can't reach). It derives
the list from `dumpsys package` at runtime — never hardcode a per-app list, and
never grant an op whose trigger permission the app doesn't declare. Full command
table in [`PLAN.md`](PLAN.md) §4a.

## Critical sync points with other projects

- The install pipeline in `js/installer.js` mirrors
  `DisplayMirror/install.sh` and the `setup:` target in `DisplayMirror/Makefile`
  (permissions, appops, autostart, ADB-key push, launch). **If either changes,
  update this site in the same commit** (and vice versa).
- APK source: GitHub Releases of `Baghdady92/DisplayMirror` (latest
  `DisplayMirror-v*.apk` via the GitHub API). Package
  `com.example.displaymirror`, activity `.MainActivity`.
- ADB keys: the site generates an extractable RSA keypair (custom credential
  store) and pushes it so DisplayMirror can act as a local ADB client — same
  files as `install.sh` pushes (`files/adbkey[.pub]`).

## G700 engineer code (firmware-side facts)

```
code = ((seed * (mm*10000 + dd*100 + hh) - hh) mod 10^6)  // 6 digits, car-local time
```

- fw 3.30–3.35: dial `*#20240730#*`, then enter code (seed `20250530`)
- fw 3.36–3.37+: dial `*#<code>#*` (same code is the menu password, rotates
  hourly; seed `20251030`)

Seeds/dial strings live as config in `js/codegen.js`, not inline constants —
new firmware may change them. Verify vectors against a real car before shipping
changes here.

## Testing

WebUSB cannot be emulated; connection/install testing requires hardware
(desktop Chrome + USB-A cable to the car, or Chrome on Android + OTG). Any
Android device with USB debugging stands in for everything except the
car-specific tolerant steps. Safety copy: never frame usage as doable while
driving.
