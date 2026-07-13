#!/usr/bin/env node
// Adopt the governance core in THIS repo (ADR-033).
//
//   node scripts/governance-init.mjs --from <owner/repo|url|path> [--layer <name>]
//
// Use it in a repo that was created from a governance template (or that already carries the scripts) and
// must now become a CONSUMER of that upstream instead of a second root of the cascade.
//
// The trap this closes: a repo copied from the template inherits its `governance/config.json`, which says
// `"upstream": null` — "I am the root, I own everything I ship". That is a perfectly valid state, so the
// drift-gate stays green while the copy silently owns its own private fork of the core and never receives
// a single update again. Nothing would ever have said so. This command rewrites the config, re-attributes
// every governed file to the layer that really owns it, and pins it — without deleting anything.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "./lib/governance.mjs";
import { CONFIG_REL, readConfig, readManifest } from "./lib/governance-core.mjs";

function fail(msg) {
  console.error(`governance:init — ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const from = arg("--from");
const layer = arg("--layer"); // omit for a leaf project: it consumes, and owns no layer of its own
const force = args.includes("--force");

if (!from) {
  fail(
    [
      "--from is required.",
      "",
      "  node scripts/governance-init.mjs --from <owner/repo>            # a leaf project (the usual case)",
      "  node scripts/governance-init.mjs --from <owner/repo> --layer app  # a repo that also PUBLISHES a layer",
      "",
      "  A leaf consumes its upstream's layers and owns none of its own. Pass --layer only if this repo",
      "  will publish governance of its own to further consumers downstream (ADR-033).",
    ].join("\n"),
  );
}

const existing = readConfig(ROOT);
if (!existing.legacy && existing.upstream && !force) {
  fail(
    `this repo already consumes ${existing.upstream} (see ${CONFIG_REL}). ` +
      "Use `npm run governance:update` to pull changes. Re-point it with --force only if you mean it.",
  );
}

// A repo that still carries the upstream's own identity is a copy that has not become itself yet. Say so
// once, loudly — this is the moment to notice, not three commits later.
const manifest = readManifest(ROOT);
if (!manifest) fail("no governance/manifest.json — this repo does not carry the governance yet.");

const config = {
  upstream: from,
  layer: layer ?? null,
  owns: { memory: [], config: [] },
  exclude: [],
};
if (!layer) delete config.owns;

fs.writeFileSync(path.join(ROOT, CONFIG_REL), `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`governance:init — wrote ${CONFIG_REL}:`);
console.log(`    upstream: ${from}`);
console.log(`    layer:    ${layer ?? "none (leaf project — it consumes, it publishes nothing)"}`);

console.log("\ngovernance:init — adopting the upstream (nothing is deleted) …\n");
try {
  const src = args.includes("--src") ? ` --src "${arg("--src")}"` : "";
  execSync(`node scripts/governance-update.mjs --adopt --allow-dirty${src}`, {
    cwd: ROOT,
    stdio: "inherit",
  });
} catch {
  fail(
    "the adoption failed — see the errors above. `governance/config.json` was written; fix and re-run.",
  );
}

console.log(
  [
    "",
    "governance:init — done. Still yours to do:",
    "  1. Rewrite `.claude/memory/project-scope.md` — it still describes the repo you copied from.",
    "     It is project-owned and `load: core`, so every agent reads it at boot. Leaving it is how a",
    "     project ends up telling its agents it is something else.",
    "  2. Reset `package.json` version + `CHANGELOG.md` to this project's own start.",
    "  3. `npm run check:all` — it must be green before anything else.",
    "",
    "From now on: `npm run governance:update` pulls the upstream's improvements in, and the drift-gate",
    "refuses any in-place edit of a file the upstream owns.",
  ].join("\n"),
);
