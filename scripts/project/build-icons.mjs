#!/usr/bin/env node
/**
 * Generate every icon Huginn ships, from the two masters in `assets/` (ADR-PROJ-003).
 *
 * There is exactly one drawing of the mark and one of the tray mark; every size, every format and
 * both tints are derived from them (ADR-CORE-005). Hand-editing a PNG in `src-tauri/icons/` is how a
 * product ends up with an old logo in one size and a new one in another.
 *
 *   npm run icons
 *
 * The renderer is Tauri's own icon generator, which takes SVG — so rasterising these files pulls in
 * no new dependency (rule:dependencies: a dependency is added only when nothing we already have can
 * do the job).
 */

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_MASTER = "assets/icon-app.svg";
const TRAY_MASTER = "assets/icon-tray.svg";
const ICONS_DIR = "src-tauri/icons";

/**
 * The two tray tints. Windows does **not** recolour a tray icon to match the taskbar — an app that
 * ships one colour is unreadable on half the desktops out there — so both are shipped and the right
 * one is chosen at runtime (see `tray.rs`). macOS takes the black one as a template image and
 * inverts it itself.
 */
const TRAY_TINTS = [
  { name: "tray-dark", colour: "#ffffff", why: "white, for a dark taskbar" },
  { name: "tray-light", colour: "#000000", why: "black, for a light taskbar" },
];

/** Mobile icon sets: Huginn is a desktop app (ADR-PROJ-001), so they are dead weight in the repo. */
const UNWANTED = ["android", "ios"];

const tauri = (args) =>
  execFileSync("npx", ["tauri", ...args], { stdio: ["ignore", "ignore", "pipe"], shell: true });

console.log(`app icons  ← ${APP_MASTER}`);
tauri(["icon", APP_MASTER]);
for (const dir of UNWANTED) {
  rmSync(join(ICONS_DIR, dir), { recursive: true, force: true });
}

// Tauri's generator writes the raster formats but leaves `icon.svg` alone — and that is the file the
// *frontend* imports (the title bar, the About dialog). Forgetting it is how an app ends up wearing
// the new logo in the taskbar and the old one in its own window. It did.
cpSync(APP_MASTER, join(ICONS_DIR, "icon.svg"));
console.log(`app svg    ← ${APP_MASTER} (the one the window itself shows)`);

const work = mkdtempSync(join(tmpdir(), "huginn-icons-"));
try {
  const master = readFileSync(TRAY_MASTER, "utf8");
  for (const { name, colour, why } of TRAY_TINTS) {
    const svg = join(work, `${name}.svg`);
    writeFileSync(svg, master.replaceAll('fill="#000000"', `fill="${colour}"`));
    tauri(["icon", svg, "-o", join(work, name)]);
    cpSync(join(work, name, "32x32.png"), join(ICONS_DIR, `${name}.png`));
    console.log(`tray icon  ← ${TRAY_MASTER} (${why})`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(`\nwritten to ${ICONS_DIR}/ — commit them; they are build inputs, not artefacts.`);
