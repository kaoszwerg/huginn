#!/usr/bin/env node
// Drift-gate CLI for the layered governance (ADR-033, ADR-032, ADR-030). The policy lives in
// scripts/lib/governance-core.mjs (and is tested there); this file only adds output + exit codes.
//   --write   re-pin this repo's OWN layer at the current package.json version
//   --sync    same as --write when this repo owns a layer; a no-op in a leaf project
//   --check   (default) verify nothing drifted (upstream-owned) or went stale (own layer)
import { ROOT } from "./lib/governance.mjs";
import { checkCore, readConfig, writeManifest } from "./lib/governance-core.mjs";

function write() {
  const config = readConfig(ROOT);
  if (!config.layer) {
    console.log(
      "governance-manifest: leaf project — it owns no layer, so there is nothing to pin. " +
        "The manifest is written by `npm run governance:update`.",
    );
    return;
  }
  const manifest = writeManifest(ROOT);
  const own = manifest.files.filter((f) => f.layer === config.layer).length;
  console.log(
    `governance-manifest: pinned ${own} file(s) in layer '${config.layer}' at v${manifest.governanceVersion} ` +
      `(${manifest.count} governed in total).`,
  );
}

// The only real ways to diverge from a file an upstream layer owns (ADR-032). Anything else the message
// used to hint at does not exist — listing an option that has no implementation sends people hunting for
// a flag that was never written.
const DIVERGE_OPTIONS = [
  "  → files owned by an upstream layer must not be edited in place. Your options:",
  "     1. project overlay — for lint/knip config, put your settings in `eslint.config.project.mjs`",
  "        or `knip.project.json` (project-owned, merged on top, never overwritten).",
  "     2. upstream it — the change belongs in the layer that owns the file: make it there, release,",
  "        then `npm run governance:update`.",
  "     3. opt out — take the path out of the pin by adding it to `governance/opt-out.json`",
  '        ({"paths": ["<governed path>"]}). The file becomes project-owned: you keep your edit, and',
  "        `governance:update` stops updating it (upstream fixes for it no longer reach you).",
  "     To discard a local edit and restore the pinned content: `git checkout -- <path>`.",
].join("\n");

function describe(result) {
  const role = [
    result.publishes ? `publishes layer '${result.layer}'` : "leaf project (owns no layer)",
    result.upstream ? `consumes from ${result.upstream}` : "no upstream (root of the cascade)",
  ].join("; ");
  return role;
}

function check() {
  const result = checkCore(ROOT);

  if (!result.ok) {
    console.error("governance-manifest: FAILED");
    for (const p of result.problems) console.error(`  - ${p}`);
    // Only show the divergence menu when the problem is actually a file this repo may not edit; a stale
    // pin in its own layer is fixed by a sync, and offering an opt-out for it would teach the wrong move.
    if (result.problems.some((p) => p.startsWith("drift:"))) console.error(DIVERGE_OPTIONS);
    if (result.problems.some((p) => p.startsWith("stale pin") || p.startsWith("unpinned file"))) {
      console.error("  → your own layer changed: run `npm run governance:sync` to re-pin it.");
    }
    process.exit(1);
  }

  const optedOut = result.optOut.length
    ? `; ${result.optOut.length} opted out: ${result.optOut.join(", ")}`
    : "";
  console.log(
    `governance-manifest: OK — ${result.pinnedCount} governed files pinned (${describe(result)})${optedOut}.`,
  );
}

const arg = process.argv[2] ?? "--check";
if (arg === "--write" || arg === "--sync") {
  write();
} else {
  check();
}
