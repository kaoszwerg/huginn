#!/usr/bin/env node
// Pull the upstream governance layers (ADR-033) into THIS repo. Overwrites ONLY the paths the upstream
// owns — minus the paths this repo opted out of (governance/opt-out.json, ADR-032). This repo's OWN
// layer and its project layer are never touched. Never commits — the maintainer reviews `git diff`.
//   node scripts/governance-update.mjs [--to <ref>]      (default ref: main)
//
// Self-update first (ADR-030): a consumer runs its OWN, possibly outdated copy of this script while it
// is fetching the new one — so a fix to the update logic itself would only take effect one update too
// late, which is exactly how a bug here reaches every project. We therefore refresh `scripts/` from
// upstream, then re-execute with the fresh logic (`--self-updated`, reusing the same clone via `--src`).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { ROOT } from "./lib/governance.mjs";
import {
  applyUpstream,
  copyCore,
  detectCollisions,
  readConfig,
  readManifest,
  readOptOut,
  writeManifest,
} from "./lib/governance-core.mjs";

function fail(msg) {
  console.error(`governance:update — ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const toIdx = args.indexOf("--to");
const ref = toIdx >= 0 ? args[toIdx + 1] : "main";
if (toIdx >= 0 && !ref) fail("--to needs a git ref");
const selfUpdated = args.includes("--self-updated");
const srcIdx = args.indexOf("--src");
const providedSrc = srcIdx >= 0 ? args[srcIdx + 1] : null;

// --adopt: the ONE-TIME step a repo runs when it first takes an upstream (ADR-033).
//
// Before it, every governed file is attributed to this repo. After it, the files the upstream owns are
// attributed to the upstream's layer and the rest to this repo's own layer. Until that re-attribution
// has happened, a normal update is *destructive*: its deletion pass walks every locally pinned file that
// the upstream does not ship — which, pre-adoption, is the entire layer this repo owns. So `--adopt`
// copies and re-attributes, and **never deletes**.
const adopt = args.includes("--adopt");

const local = readManifest(ROOT);
if (!local) fail("no governance/manifest.json — is this a governed project?");

const config = readConfig(ROOT);
if (config.errors.length) fail(config.errors.join("\n"));
if (!config.upstream) {
  fail(
    "this repo has no upstream — it is the root of the cascade and owns everything it ships. " +
      "Edit the layer here instead.",
  );
}

const { paths: optOut, errors } = readOptOut(ROOT);
if (errors.length) fail(errors.join("\n"));

// The update is NOT atomic: it rewrites files, then verifies. If the gate then fails, the tree is
// half-updated and the only honest recovery is `git checkout -- . && git clean -fd` — which would also
// throw away uncommitted work. So a dirty tree is refused up front, and the rollback stays safe.
if (!selfUpdated && !args.includes("--allow-dirty")) {
  const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) {
    fail(
      "the working tree has uncommitted changes. The update rewrites governed files and is not atomic; " +
        "rolling it back means `git checkout -- . && git clean -fd`, which would also discard your work.\n" +
        "  → commit or stash first, then re-run. (`--allow-dirty` overrides this — then the rollback is yours.)",
    );
  }
}

/**
 * `upstream` may be a GitHub slug (`owner/repo`), a full URL, or a local path — the last one so the
 * cascade can be exercised end-to-end before the upstream repo exists on a remote (rule:verification:
 * prove it, don't assume it). `git clone` accepts a path as a source unchanged.
 */
function resolveSource(upstream) {
  const raw = String(upstream);
  const isUrl = /^(https?|git|ssh|file):/.test(raw);
  const isPath = path.isAbsolute(raw) || raw.startsWith(".") || /^[A-Za-z]:[\\/]/.test(raw);
  if (isUrl || isPath) return { url: raw, local: isPath || raw.startsWith("file:") };
  return { url: `https://github.com/${raw}.git`, local: false };
}

const source = resolveSource(config.upstream);
const tmp = providedSrc ?? fs.mkdtempSync(path.join(os.tmpdir(), "gov-core-"));

/** The update itself. Returns when done; the clone is cleaned up by the caller. */
function run() {
  if (!providedSrc) {
    console.log(`governance:update — cloning ${source.url} @ ${ref} …`);
    execSync(`git clone --depth 1 --branch ${ref} "${source.url}" "${tmp}"`, { stdio: "inherit" });
  }

  const upstream = readManifest(tmp);
  if (!upstream) fail(`the upstream has no governance/manifest.json at '${ref}'.`);

  // A path this repo authored that the upstream has started shipping under the same name would be
  // overwritten by the copy below, and the diff would look like an ordinary update. Refuse instead.
  const collisions = detectCollisions({ local, upstream, ownLayer: config.layer });
  if (collisions.length) {
    fail(
      [
        `the upstream now ships ${collisions.length} path(s) that this repo owns in layer '${config.layer}':`,
        ...collisions.map((p) => `    - ${p}`),
        "",
        "  Applying the update would silently replace your file with theirs. Resolve it first:",
        "    • rename yours (and update whatever references it), or",
        `    • opt the path out in governance/opt-out.json to keep yours and stop receiving theirs.`,
      ].join("\n"),
    );
  }

  if (adopt) {
    const { changed, skipped } = copyCore({ root: ROOT, srcDir: tmp, upstream, optOut });
    const manifest = writeManifest(ROOT, { upstream });
    const byLayer = new Map();
    for (const f of manifest.files) byLayer.set(f.layer, (byLayer.get(f.layer) ?? 0) + 1);

    console.log(
      `governance:update --adopt — adopted ${config.upstream} as upstream. Nothing was deleted.`,
    );
    for (const [layer, n] of byLayer) {
      const src = manifest.layers.find((l) => l.id === layer)?.source;
      console.log(`  layer '${layer}': ${n} file(s)${src ? ` — from ${src}` : " — owned here"}`);
    }
    if (changed.length)
      console.log(`  ${changed.length} file(s) replaced by the upstream's version.`);
    if (skipped.length) console.log(`  ${skipped.length} opted-out path(s) left alone.`);
    console.log(
      "\n  Check `git diff` and the new governance/manifest.json: every file must sit in the layer that " +
        "really owns it. From now on `governance:update` is the normal, incremental path.",
    );
    return;
  }

  // Phase 1 — bring THIS script (and the rest of scripts/) up to date, then run the real update with the
  // freshly pulled logic. Without this, the old logic decides how the update behaves, and a fix to that
  // logic can never reach the update that delivers it.
  if (!selfUpdated) {
    const { changed: scriptsChanged } = copyCore({
      root: ROOT,
      srcDir: tmp,
      upstream,
      optOut,
      filter: (p) => p.startsWith("scripts/"),
    });
    if (scriptsChanged.length) {
      console.log(
        `governance:update — refreshed ${scriptsChanged.length} governance script(s) first; re-running with the updated logic …\n`,
      );
      execSync(`node scripts/governance-update.mjs --to ${ref} --self-updated --src "${tmp}"`, {
        cwd: ROOT,
        stdio: "inherit",
      });
      return; // the re-executed run did the work
    }
  }

  const { changed, removed, skipped, released } = applyUpstream({
    root: ROOT,
    srcDir: tmp,
    upstream,
    local,
    optOut,
  });

  // Compare like with like: the version of the layers we just PULLED, not this repo's own. In a repo that
  // publishes a layer of its own, `governanceVersion` is that layer's version (its app SemVer) — printing
  // it as the "from" of a core update would compare an app version against a core one and read as a
  // downgrade.
  const upstreamLayer = (l) => (l.layers ?? []).find((x) => x.source === config.upstream);
  const from = upstreamLayer(local)?.version ?? local.governanceVersion ?? "?";
  const to = upstream.governanceVersion ?? "?";
  console.log(
    `governance:update — updated ${changed.length} upstream file(s) from ${config.upstream}: v${from} → v${to}.`,
  );
  if (config.layer) {
    console.log(`  This repo's own layer '${config.layer}' was not touched.`);
  }
  if (removed.length) {
    console.log(`  Removed ${removed.length} file(s) deleted upstream:`);
    for (const p of removed) console.log(`    - ${p}`);
    // The file is gone from the working tree but not from history — say how to get its content back,
    // because a project may have had local settings in it.
    console.log("    Had local content in one of these? Recover it with `git show HEAD:<path>`.");
  }
  // Opt-outs are always reported: a path that silently stops receiving upstream fixes is exactly the
  // kind of drift this system exists to make visible (ADR-032).
  if (skipped.length) {
    console.log(`  Kept ${skipped.length} opted-out path(s) — project-owned, not updated:`);
    for (const p of skipped) console.log(`    - ${p}`);
  }
  // A path the upstream unpinned but still ships now belongs to this project — say so, because the
  // maintainer just inherited responsibility for it (no more upstream updates for that file).
  if (released.length) {
    console.log(
      `  Released ${released.length} path(s) to the project layer — yours now, kept as-is:`,
    );
    for (const p of released) console.log(`    - ${p}`);
  }

  // The briefings are the handover: a change a project must ACT on is useless if the agent never reads
  // it (rule:knowledge-handover). Surface the ones this update touched, and always point at the folder —
  // this is the one moment we know an agent is looking.
  const briefings = changed.filter((p) => p.startsWith("docs/migrations/"));
  if (briefings.length) {
    console.log(
      `\n  READ THESE — ${briefings.length} migration briefing(s) changed in this update:`,
    );
    for (const p of briefings) console.log(`    - ${p}`);
    console.log("  They say what this project must do and what is now forbidden.");
  } else {
    console.log("\n  Briefings for agents working in this project: docs/migrations/");
  }

  console.log("\ngovernance:update — regenerating indexes + verifying …");
  try {
    execSync("npm run governance:sync", { cwd: ROOT, stdio: "inherit" });
    execSync("npm run governance:check", { cwd: ROOT, stdio: "inherit" });
  } catch {
    // The files are already written; only the verification failed. Say so plainly and give both exits —
    // a half-updated tree with no instructions is how a project ends up in an unknown state.
    console.error(
      [
        "",
        "governance:update — the update was applied, but the gate is RED. The tree is half-updated:",
        "  the new files are in place, their verification is not passing.",
        "",
        "  Most likely the new gate found a pre-existing problem in YOUR project layer (e.g. a",
        "  'conditional' rule/ADR/memory with no triggers is now rejected as unreachable). Read the",
        "  errors above — they name the file and the fix.",
        "",
        "  Two ways out:",
        "    1. Finish it — fix what the gate reported, then `npm run check:all`. This is the normal path.",
        "    2. Roll back — `git checkout -- . && git clean -fd` discards the whole update (your tree was",
        "       clean before it started, which is why this is safe), then re-run when ready.",
      ].join("\n"),
    );
    process.exit(1);
  }

  console.log(
    "\ngovernance:update — done. Review `git diff`, revert any project-owned file you did not intend to change, then commit.",
  );
}

try {
  run();
} finally {
  // Only the process that made the clone removes it — the re-executed child borrows it via --src.
  if (!providedSrc) fs.rmSync(tmp, { recursive: true, force: true });
}
