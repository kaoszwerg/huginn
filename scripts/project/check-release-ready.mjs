#!/usr/bin/env node
// Refuse a release build while a deferred decision is still open (ADR-PROJ-002).
//
// Four decisions about Huginn are genuinely undecided — the publisher (and therefore the bundle
// identifier), the Apple Developer account, the licence, and the trademark check — plus the design
// system, which is still the template's. None of them blocks development; ALL of them block a release,
// and the identifier is the dangerous one: after the first release, macOS keys the user's microphone and
// accessibility grants to it, so changing it later takes their permissions away.
//
// The failure mode this guards is not "we decide wrong". It is "we forget, and ship". A checklist in a
// document gets skipped on exactly the day it matters; a gate cannot be (rule:knowledge-handover §1).
//
// It runs on the RELEASE path, not in check:all, on purpose: a blocker that reddens every development
// build for a reason nobody can act on today teaches the next agent to bypass gates. The chokepoint is
// `beforeBuildCommand` in src-tauri/tauri.conf.json — the one thing BOTH a local `tauri build` and the
// tag-triggered CI release run. `tauri dev` uses `beforeDevCommand` and is untouched.
//
// The escape hatch exists because a bundled build is sometimes needed to TEST (the overlay's transparency
// must be proven in a real DMG, not in `tauri dev` — tauri#13415). Setting HUGINN_UNRELEASABLE_BUILD=1
// lets the build through and prints a banner saying the artefact must not be given to anyone. It is loud,
// it is deliberate, and CI never sets it — so a release still cannot slip past.
//
//   node scripts/project/check-release-ready.mjs          # exit 1 while anything is unresolved
//   node scripts/project/check-release-ready.mjs --json   # machine-readable, same exit code
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BLOCKERS_REL = "release-blockers.json";
export const ESCAPE_ENV = "HUGINN_UNRELEASABLE_BUILD";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Read and validate `release-blockers.json`.
 *
 * @param {string} root repo root to read from (a temp dir in tests — never the live repo)
 * @returns {{ blockers: Array<object>, open: Array<object>, errors: string[] }}
 *   `errors` is non-empty when the file is missing or malformed. A missing or unreadable blocker list is
 *   an ERROR, never an implicit "nothing is blocking" — the whole point is that it cannot be sidestepped.
 */
export function readBlockers(root) {
  const abs = path.join(root, BLOCKERS_REL);
  if (!fs.existsSync(abs)) {
    return {
      blockers: [],
      open: [],
      errors: [`${BLOCKERS_REL} is missing. A release cannot be cleared by deleting the list.`],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    return {
      blockers: [],
      open: [],
      errors: [`${BLOCKERS_REL} is not valid JSON: ${err.message}`],
    };
  }

  const blockers = parsed?.blockers;
  if (!Array.isArray(blockers)) {
    return { blockers: [], open: [], errors: [`${BLOCKERS_REL}: "blockers" must be an array.`] };
  }

  const errors = [];
  for (const [i, b] of blockers.entries()) {
    if (typeof b?.id !== "string" || !b.id)
      errors.push(`${BLOCKERS_REL}: blocker ${i} has no "id".`);
    if (typeof b?.title !== "string" || !b.title)
      errors.push(`${BLOCKERS_REL}: blocker '${b?.id ?? i}' has no "title".`);
    if (typeof b?.resolved !== "boolean")
      errors.push(`${BLOCKERS_REL}: blocker '${b?.id ?? i}' needs "resolved": true | false.`);
    // A blocker cannot be closed silently: closing it means recording WHAT was decided, in the same file
    // the maintainer reviews. "resolved: true" with nothing written down is how a decision gets lost.
    if (b?.resolved === true && (typeof b?.resolution !== "string" || !b.resolution.trim()))
      errors.push(
        `${BLOCKERS_REL}: blocker '${b?.id}' is marked resolved but has no "resolution" — write down what was decided.`,
      );
  }

  return { blockers, open: blockers.filter((b) => b?.resolved !== true), errors };
}

/**
 * The whole decision, as a pure function — so it can be tested without spawning a build.
 *
 * @param {{errors: string[], open: Array<object>, escape: boolean}} state
 * @returns {{code: 0|1, mode: "malformed"|"clear"|"escape"|"blocked"}}
 */
export function decide({ errors, open, escape }) {
  if (errors.length) return { code: 1, mode: "malformed" };
  if (open.length === 0) return { code: 0, mode: "clear" };
  // An escape only ever bypasses OPEN blockers — never a malformed list. A file nobody can parse is not
  // a "test build", it is a broken gate, and it fails whatever anyone sets.
  if (escape) return { code: 0, mode: "escape" };
  return { code: 1, mode: "blocked" };
}

function main() {
  const { blockers, open, errors } = readBlockers(ROOT);
  const { code, mode } = decide({ errors, open, escape: Boolean(process.env[ESCAPE_ENV]) });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ ok: code === 0, mode, errors, open }, null, 2));
    process.exit(code);
  }

  if (mode === "malformed") {
    console.error(`release:check — ${BLOCKERS_REL} is unusable:\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(code);
  }

  if (mode === "clear") {
    console.log(
      `release:check — all ${blockers.length} release blockers are resolved. Clear to build.`,
    );
    process.exit(code);
  }

  // The escape hatch: a bundled build that is explicitly NOT for anyone. It must announce itself.
  if (mode === "escape") {
    console.warn(
      `\n  ${"!".repeat(76)}\n` +
        `  ${ESCAPE_ENV} is set — building with ${open.length} OPEN release blocker(s).\n\n` +
        `  THIS ARTEFACT MUST NOT BE GIVEN TO ANYONE. It is a test build: the publisher, the\n` +
        `  signing identity, the licence and/or the design are not decided (ADR-PROJ-002), and the\n` +
        `  bundle identifier is provisional — installing it on someone's machine would key their\n` +
        `  macOS permissions to an identifier that is going to change.\n\n` +
        `  Open: ${open.map((b) => b.id).join(", ")}\n` +
        `  ${"!".repeat(76)}\n`,
    );
    process.exit(code);
  }

  console.error(
    `\nrelease:check — ${open.length} of ${blockers.length} release blockers are still OPEN (ADR-PROJ-002).\n` +
      `Huginn must not be built for release while any of these stands:\n`,
  );
  for (const b of open) {
    console.error(`  ✗ ${b.id} — ${b.title}`);
    if (b.why) console.error(`      why:  ${b.why}`);
    if (b.how) console.error(`      how:  ${b.how}`);
    console.error("");
  }
  console.error(
    `  Close one by deciding it, doing what "how" says, and setting "resolved": true with a "resolution"\n` +
      `  in ${BLOCKERS_REL}. Deleting an entry to go green is falsifying a record, not resolving it\n` +
      `  (rule:code-quality).\n\n` +
      `  Development is unaffected: \`npm run app:dev\` never runs this gate.\n` +
      `  Need a BUNDLED build to test something (e.g. overlay transparency in a real DMG — it behaves\n` +
      `  differently from \`tauri dev\`, tauri#13415)? Say so explicitly, and the artefact labels itself:\n\n` +
      `      bash:        ${ESCAPE_ENV}=1 npm run app:build\n` +
      `      PowerShell:  $env:${ESCAPE_ENV}=1; npm run app:build\n\n` +
      `  CI never sets it — a release cannot slip past this way.\n`,
  );
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
