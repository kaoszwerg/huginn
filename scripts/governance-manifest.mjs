#!/usr/bin/env node
// Drift-gate CLI for the layered governance (ADR-CORE-033, ADR-CORE-032, ADR-CORE-030). The policy lives in
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

// The real ways to diverge from a file an upstream layer owns, in the order they should be considered.
//
// ADR-CORE-032 says: never advertise a mechanism that does not exist. The inverse costs just as much, and
// it happened — this menu offered three options and silently omitted SUPERSEDE, which was the right one
// for the case that hit it. The consumer was pushed toward opt-out (the worst fit), found it broken, and
// wrote a workaround. A menu that hides the correct option is not a smaller defect than one that invents
// a wrong one.
//
// The decision procedure itself is rule:upstream-changes, which the last line points at — the message
// names the options, the rule says how to choose between them.
const DIVERGE_OPTIONS = [
  "  → files owned by an upstream layer must not be edited in place. Your options, best first:",
  "",
  "     1. put it in YOUR layer — most changes are only true for this project. A new rule/ADR/script",
  "        of your own needs nothing from the upstream at all. Ask honestly whether it is only-here.",
  "     2. supersede it — to DECLINE an upstream decision, declare `supersedes: [<its id>]` in your own",
  "        document (ADR-CORE-035). Their file is never touched, and you keep every other upstream fix.",
  "        You do not need to own a file to disagree with it.",
  "     3. overlay — for config the upstream provides one for: put your settings in",
  "        `eslint.config.project.mjs` or `knip.project.json` (project-owned, merged on top).",
  "     4. opt out — LAST RESORT, config only: add the path to `governance/opt-out.json`",
  '        ({"paths": ["<governed path>"]}). You keep your edit and STOP RECEIVING every future upstream',
  "        fix for that file. Printed on every update, on purpose.",
  "",
  "     Genuinely belongs upstream? It is a PROPOSAL to the maintainer, not something you commit: it is",
  "     another repo, and it costs one commit per layer between the core and you (rule:upstream-changes).",
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
