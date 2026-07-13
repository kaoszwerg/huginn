// Turning a fresh copy of this template into a consumer (ADR-CORE-033) — the part that must be right,
// and therefore the part that is tested.
//
// It used to write `upstream` into `governance/manifest.json`:
//
//     manifest.upstream = upstream;
//     console.log(`bootstrap — marked as a fork of ${upstream} (governance:update enabled)`);
//
// Since ADR-CORE-033 the upstream lives in `governance/config.json`. `readConfig()` reads
// `manifest.upstream` **only** in the legacy fallback, i.e. only when there is no config file — and a copy
// of this template has one, because this template has one. So the write went to a dead key, the fork
// pointer never moved, and the script **printed success**.
//
// A false success is worse than a failure: the next agent believes it and builds on a lie. Two things
// follow from that, and both are enforced below:
//
//   • the marker is written where the governance actually reads it, and
//   • it is READ BACK and verified before anything claims to have worked.
//
// The second bug was quieter and just as bad: a copy inherits this repo's `layer: "app"` and its `owns`
// list. A new project is a **leaf** — it consumes, it publishes nothing. Left as-is, it would claim to own
// and publish the layer its template owns, and the gate would demand it pin files it has no business
// publishing.
import fs from "node:fs";
import path from "node:path";
import { CONFIG_REL, readConfig } from "./governance-core.mjs";

/**
 * The config a fresh consumer needs: it consumes `upstream`, and it owns **no layer of its own**.
 * `owns` and `exclude` are deliberately absent/empty — a leaf publishes nothing, so declaring what it
 * "owns" is a contradiction the gate rejects.
 */
export function forkConfig(upstream) {
  return { upstream, layer: null, exclude: [] };
}

/**
 * Write the fork marker and **verify it took effect** by reading it back through the same code path the
 * governance uses. Returns `{ ok, errors }`; never throws, never claims success it has not checked.
 */
export function writeForkMarker(root, upstream) {
  if (!upstream) return { ok: false, errors: ["no upstream given"] };

  const abs = path.join(root, CONFIG_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(forkConfig(upstream), null, 2)}\n`);

  // Read it back through readConfig() — not through JSON.parse of what we just wrote. What matters is
  // what the GOVERNANCE sees, not what we think we stored.
  const config = readConfig(root);
  const errors = [...config.errors];
  if (config.upstream !== upstream) {
    errors.push(`the governance still reads upstream '${config.upstream}', not '${upstream}'`);
  }
  if (config.layer !== null) {
    errors.push(
      `the governance still reads layer '${config.layer}' — a new project is a leaf and owns none`,
    );
  }
  return { ok: errors.length === 0, errors, config };
}
