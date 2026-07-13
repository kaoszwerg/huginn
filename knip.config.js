// Core knip configuration — template-owned and hash-pinned (ADR-030).
//
// Project-specific knip settings do NOT belong in this file: put them in `knip.project.json`
// (project-owned, never pinned, never overwritten by `governance:update`) and they are merged in here
// (ADR-032). Typical case: a fork's generated `src/bindings/**` has no consumer yet, so knip reports
// the files as unused — `{"ignore": ["src/bindings/**"]}` in the overlay settles it without touching
// the core. knip has no `extends`, and it resolves `knip.json` *before* this file — so the JSON form
// must not exist; the overlay carries a different name on purpose.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OVERLAY = path.join(path.dirname(fileURLToPath(import.meta.url)), "knip.project.json");

/** The coverage floor every project inherits: dead code is a defect (rule:code-quality). */
const core = {
  // scripts/project/* is the project's own tooling (ADR-032) — an entry point, not dead code.
  entry: ["scripts/*.mjs", "scripts/lib/*.mjs", "scripts/project/*.mjs"],
  project: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
  ignoreDependencies: ["tailwindcss", "@secretlint/secretlint-rule-preset-recommend"],
  ignoreBinaries: ["rustfmt"],
};

/**
 * Merge the project overlay onto the core: arrays are unioned (the project *adds* entries, it cannot
 * silently drop the core's coverage), nested objects merge key-wise, and any other value from the
 * overlay wins. Divergence stays additive — the same contract the governance core follows (ADR-030).
 */
function merge(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (key === "$schema") continue;
    const current = out[key];
    if (Array.isArray(current) && Array.isArray(value)) {
      out[key] = [...new Set([...current, ...value])];
    } else if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = merge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

const overlay = fs.existsSync(OVERLAY) ? JSON.parse(fs.readFileSync(OVERLAY, "utf8")) : {};

export default merge(core, overlay);
