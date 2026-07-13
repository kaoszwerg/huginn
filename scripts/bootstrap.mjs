#!/usr/bin/env node
// Deterministic, always-safe half of turning a fresh saga-rust-template copy into a new project
// (ADR-CORE-030): reset the version to 0.1.0, reset the CHANGELOG, and optionally mark this copy as a fork
// of the template (enabling governance:update + the drift-gate). The judgement-heavy half — renaming
// the app identity across the checklist and generating icons — is done by the `/bootstrap` agent
// prompt (.claude/commands/bootstrap.md), which calls THIS for the mechanical resets and then
// verifies with `check:all`.
//   node scripts/bootstrap.mjs [--upstream owner/repo]
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "./lib/governance.mjs";
import { writeForkMarker } from "./lib/bootstrap-fork.mjs";

const args = process.argv.slice(2);
const upIdx = args.indexOf("--upstream");
const upstream = upIdx >= 0 ? args[upIdx + 1] : null;

// 1) Reset the app version to 0.1.0 — a new project starts its own SemVer, independent of the
//    template's governance version (ADR-CORE-024).
const pkgPath = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.version = "0.1.0";
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log("bootstrap — version reset to 0.1.0");

// 2) Reset the CHANGELOG to a fresh, empty [Unreleased] section (Keep a Changelog / ADR-CORE-024).
const changelog = `# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (ADR-CORE-024).

## [Unreleased]
`;
fs.writeFileSync(path.join(ROOT, "CHANGELOG.md"), changelog);
console.log("bootstrap — CHANGELOG reset to a fresh [Unreleased]");

// 3) Mark this copy as a CONSUMER of the template (ADR-CORE-033): the upstream goes into
//    `governance/config.json` — where the governance actually reads it — and the copy is declared a
//    **leaf** (`layer: null`), because a new project consumes and publishes nothing. Both matter:
//    this used to write `upstream` into the manifest, a key `readConfig()` only consults when there is
//    no config file at all, and then printed success. A false success is worse than a failure — the next
//    agent believes it. It also left this template's `layer: "app"` + `owns` in place, so the copy claimed
//    to publish the very layer it had just forked.
if (upstream) {
  const { ok, errors } = writeForkMarker(ROOT, upstream);
  if (!ok) {
    console.error(`bootstrap — FAILED to mark this copy as a consumer of ${upstream}:`);
    for (const e of errors) console.error(`    - ${e}`);
    process.exit(1);
  }
  console.log(`bootstrap — governance/config.json: consumes ${upstream}, owns no layer (verified)`);

  // The marker alone is not enough: until the governed files are re-attributed to the layer that really
  // owns them, the manifest still describes the TEMPLATE's roles. `--adopt` does that and never deletes.
  try {
    execSync("node scripts/governance-update.mjs --adopt --allow-dirty", {
      cwd: ROOT,
      stdio: "inherit",
    });
  } catch {
    console.error(
      "\nbootstrap — the adoption step failed (offline? upstream unreachable?). The fork marker IS\n" +
        "  written, but the layer attribution is still the template's. Run this before anything else:\n" +
        "      node scripts/governance-update.mjs --adopt\n",
    );
    process.exit(1);
  }
} else {
  console.log(
    "bootstrap — no --upstream given. This copy is NOT yet a consumer: run\n" +
      "    node scripts/bootstrap.mjs --upstream <owner/repo>\n" +
      "  to point it at its template and adopt the governance layers.",
  );
}

// 4) Keep the Rust version in lockstep with package.json so the gate stays green.
try {
  execSync("npm run version:sync", { cwd: ROOT, stdio: "inherit" });
} catch {
  console.log("bootstrap — version:sync failed; run `npm run version:sync` manually");
}

console.log(`
bootstrap — mechanical resets done. The /bootstrap agent prompt now:
  1. Sets the identity in app.identity.json, then runs 'npm run identity:sync' (ADR-APP-031) — one source
     propagates to package.json, Cargo.toml, the tauri configs, src/lib/app.ts, index.html + crate refs.
  2. Generates new icons (design src-tauri/icons/icon.svg -> a 1024px PNG -> 'npm run tauri icon <png>').
  3. Runs 'npm run gen:types' and 'npm run check:all' to verify everything green.
`);
