// Tests for js/permfix.js — the `dumpsys package` parser that decides which
// permissions get granted, and the app-op trigger table.
import { readFileSync } from "node:fs";

// Browser classic script (global DMPermFix) with a DOM-touching init(); give
// it an inert document so it can load in Node.
const stubDoc = {
  readyState: "complete",
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; },
};
const src = readFileSync(new URL("../js/permfix.js", import.meta.url), "utf8");
const P = new Function("document", `${src}; return DMPermFix;`)(stubDoc);

let failures = 0;
const ok = (cond, label, extra = "") => {
  if (!cond) { console.error(`FAIL ${label} ${extra}`); failures++; }
  else console.log(`ok   ${label}`);
};

// ── parseRequested ─────────────────────────────────────────────────────
// Shape of `dumpsys package <pkg>` on Android 12–14 (indentation preserved).
const DUMP = `
Packages:
  Package [com.example.player] (7c1f2a3):
    userId=10231
    pkg=Package{5f3 com.example.player}
    versionName=2.4.1
    requested permissions:
      android.permission.INTERNET
      android.permission.READ_EXTERNAL_STORAGE: restricted=true
      android.permission.SYSTEM_ALERT_WINDOW
      android.permission.REQUEST_INSTALL_PACKAGES
      com.example.player.permission.CUSTOM
    install permissions:
      android.permission.INTERNET: granted=true
    User 0: ceDataInode=1234 installed=true hidden=false
      gids=[3003]
      runtime permissions:
        android.permission.READ_EXTERNAL_STORAGE: granted=false, flags=[ USER_SET ]
`;

const req = P.parseRequested(DUMP);
ok(req.has("android.permission.INTERNET"), "parses a bare requested permission");
ok(req.has("android.permission.READ_EXTERNAL_STORAGE"), "strips the ': restricted=true' suffix");
ok(req.has("com.example.player.permission.CUSTOM"), "keeps app-defined permissions");
ok(req.size === 5, "stops at the next section", `got ${req.size}: ${[...req].join(", ")}`);
ok(!req.has("android.permission.ACCESS_FINE_LOCATION"), "does not invent permissions");

// A package with no requested block (system stub / parse miss) yields nothing
// rather than a bogus grant list.
ok(P.parseRequested("Packages:\n  Package [com.x] (1):\n    userId=1\n").size === 0,
   "missing requested block → empty set");

// Section header lines never leak in as permission names.
ok(![...P.parseRequested(DUMP)].some((p) => p.includes(" ")), "no header lines parsed as permissions");

// ── app-op triggers ────────────────────────────────────────────────────
// Every op must be reachable from a permission an app can actually declare.
for (const [op, triggers] of Object.entries(P.OP_TRIGGERS)) {
  ok(triggers.length > 0 && triggers.every((t) => /^[a-z][\w.]*\.permission\.[A-Z_0-9]+$/.test(t)),
     `op ${op} has valid trigger permissions`, triggers.join(", "));
}
ok(P.OP_TRIGGERS.REQUEST_INSTALL_PACKAGES.includes("android.permission.REQUEST_INSTALL_PACKAGES"),
   "install-unknown-apps op is tied to its manifest permission");
ok(P.ALWAYS_OPS.includes("ACCESS_RESTRICTED_SETTINGS"),
   "restricted-settings op is applied to every app");

process.exit(failures ? 1 : 0);
