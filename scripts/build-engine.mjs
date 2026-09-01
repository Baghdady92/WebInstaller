// Bundles the @yume-chan/adb (Tango) WebADB engine into vendor/dm-engine.bundle.js
// as window.DMEngine. The bundle is COMMITTED so the site never needs a build
// to serve — rerun this only when upgrading the library (npm i, then commit
// the new bundle + updated package-lock.json together).
//
// Usage: npm install && npm run build:engine
import * as esbuild from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const adb = await import("@yume-chan/adb");
const webusb = await import("@yume-chan/adb-daemon-webusb");

const exportsMap = {
  // @yume-chan/adb
  Adb: adb.Adb,
  AdbDaemonTransport: adb.AdbDaemonTransport,
  AdbAuthType: adb.AdbAuthType,
  adbGeneratePublicKey: adb.adbGeneratePublicKey,
  encodeBase64: adb.encodeBase64,
  // @yume-chan/adb-daemon-webusb
  AdbDaemonWebUsbDeviceManager: webusb.AdbDaemonWebUsbDeviceManager,
  AdbDefaultInterfaceFilter: webusb.AdbDefaultInterfaceFilter,
};

// Fail the build if a future library upgrade removes an export we rely on.
for (const [name, value] of Object.entries(exportsMap)) {
  if (value === undefined) {
    throw new Error(`Missing export: ${name} — library API changed, update this script`);
  }
}

const entry = `
import { ${Object.keys(exportsMap).filter((k) => !k.startsWith("AdbDaemonWebUsb") && !k.startsWith("AdbDefault")).join(", ")} } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager, AdbDefaultInterfaceFilter } from "@yume-chan/adb-daemon-webusb";
export { ${Object.keys(exportsMap).join(", ")} };
`;

mkdirSync("vendor", { recursive: true });
writeFileSync("scripts/.engine-entry.js", entry);

try {
  await esbuild.build({
    entryPoints: ["scripts/.engine-entry.js"],
    outfile: "vendor/dm-engine.bundle.js",
    bundle: true,
    format: "iife",
    globalName: "DMEngine",
    target: ["chrome110"],
    minify: true,
    legalComments: "none",
    logLevel: "info",
  });
} finally {
  rmSync("scripts/.engine-entry.js", { force: true });
}
