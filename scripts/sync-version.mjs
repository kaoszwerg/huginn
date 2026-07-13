#!/usr/bin/env node
// Keep the version a single source of truth: package.json is authoritative; this syncs it into
// src-tauri/Cargo.toml ([package] version) AND src-tauri/Cargo.lock (the crate's own [[package]]
// entry). tauri.conf.json reads package.json directly. (ADR-CORE-024)
//
// The lock matters: every Rust step of the gate builds with `--locked` (clippy, test, gen:types, CI).
// A bumped Cargo.toml with a stale lock therefore fails with "cannot update the lock file … because
// --locked was passed" — so the bump writes both, and `--check` fails on either.
//
//   node scripts/sync-version.mjs          # write Cargo.toml + Cargo.lock to match package.json
//   node scripts/sync-version.mjs --check  # fail (exit 1) if they differ — used in check:all
//
// Under npm's `version` lifecycle (`npm version <x>`) it also stages what it wrote, so the bump
// travels in one commit with the change that earned it (rule:versioning).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CARGO_TOML = "src-tauri/Cargo.toml";
export const CARGO_LOCK = "src-tauri/Cargo.lock";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bounds of the `[package]` table body — so a dependency's version is never mistaken for the crate's. */
function packageSection(cargoToml) {
  const header = cargoToml.match(/(^|\n)\[package\][^\n]*\n/);
  if (!header) return null;
  const start = header.index + header[0].length;
  const next = cargoToml.slice(start).search(/\n\[/);
  return { start, end: next === -1 ? cargoToml.length : start + next + 1 };
}

/** Read `key = "value"` from the `[package]` table; null when absent. */
function packageKey(cargoToml, key) {
  const section = packageSection(cargoToml);
  if (!section) return null;
  const m = cargoToml
    .slice(section.start, section.end)
    .match(new RegExp(`(^|\\n)${key}\\s*=\\s*"([^"]+)"`));
  return m ? m[2] : null;
}

/** The crate version declared in `[package]`. */
export function packageVersionOf(cargoToml) {
  return packageKey(cargoToml, "version");
}

/** The crate name declared in `[package]` — the key into Cargo.lock. */
export function crateNameOf(cargoToml) {
  return packageKey(cargoToml, "name");
}

/** Cargo.toml with the `[package]` version replaced (dependency versions untouched). */
export function withPackageVersion(cargoToml, version) {
  const section = packageSection(cargoToml);
  if (!section) throw new Error(`sync-version: no [package] section in ${CARGO_TOML}`);
  const body = cargoToml.slice(section.start, section.end);
  const re = /(^|\n)(version\s*=\s*")([^"]+)(")/;
  if (!re.test(body)) throw new Error(`sync-version: no [package] version in ${CARGO_TOML}`);
  return (
    cargoToml.slice(0, section.start) +
    body.replace(re, `$1$2${version}$4`) +
    cargoToml.slice(section.end)
  );
}

/** The `[[package]]` entry of one crate in Cargo.lock — never the lockfile-format `version` key. */
function lockEntryRe(crate) {
  return new RegExp(
    `(\\[\\[package\\]\\]\\s*\\nname\\s*=\\s*"${escapeRe(crate)}"\\s*\\nversion\\s*=\\s*")([^"]+)(")`,
  );
}

/** The version Cargo.lock records for `crate`; null when the crate has no entry. */
export function lockVersionOf(cargoLock, crate) {
  const m = cargoLock.match(lockEntryRe(crate));
  return m ? m[2] : null;
}

/** Cargo.lock with only `crate`'s own entry rewritten. */
export function withLockVersion(cargoLock, crate, version) {
  return cargoLock.replace(lockEntryRe(crate), `$1${version}$3`);
}

/**
 * Sync (or, with `check`, verify) the Rust manifests against package.json.
 *
 * @param {{root?: string, check?: boolean}} options
 * @returns {{version: string, crate: string, written: string[], stale: {file: string, found: string}[], drift: boolean}}
 * @throws when a manifest cannot be read or the crate is missing from the lock — never silently skipped.
 */
export function syncVersion({ root = process.cwd(), check = false } = {}) {
  const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

  const tomlPath = path.join(root, CARGO_TOML);
  const toml = readFileSync(tomlPath, "utf8");
  const tomlVersion = packageVersionOf(toml);
  if (!tomlVersion)
    throw new Error(`sync-version: could not find the [package] version in ${CARGO_TOML}`);
  const crate = crateNameOf(toml);
  if (!crate) throw new Error(`sync-version: could not find the [package] name in ${CARGO_TOML}`);

  const written = [];
  const stale = [];

  if (tomlVersion !== version) {
    stale.push({ file: CARGO_TOML, found: tomlVersion });
    if (!check) {
      writeFileSync(tomlPath, withPackageVersion(toml, version));
      written.push(CARGO_TOML);
    }
  }

  // A project that has never built Rust yet has no lock — that is fine; `cargo` writes it on first
  // build, already carrying the synced version. A lock that exists but lacks the crate is a defect.
  const lockPath = path.join(root, CARGO_LOCK);
  if (existsSync(lockPath)) {
    const lock = readFileSync(lockPath, "utf8");
    const lockVersion = lockVersionOf(lock, crate);
    if (lockVersion === null) {
      throw new Error(
        `sync-version: crate "${crate}" has no [[package]] entry in ${CARGO_LOCK} — regenerate it with ` +
          `\`cargo check --manifest-path ${CARGO_TOML}\` and commit the lock.`,
      );
    }
    if (lockVersion !== version) {
      stale.push({ file: CARGO_LOCK, found: lockVersion });
      if (!check) {
        writeFileSync(lockPath, withLockVersion(lock, crate, version));
        written.push(CARGO_LOCK);
      }
    }
  }

  return { version, crate, written, stale, drift: check && stale.length > 0 };
}

/**
 * Stage what the bump touched, so `npm version` (tagging or not) cannot leave a half-bumped tree
 * behind: a tag commit without the synced lock builds red for everyone who checks it out.
 */
function stageVersionCommit(written) {
  const files = [...written, ...(existsSync("CHANGELOG.md") ? ["CHANGELOG.md"] : [])];
  if (files.length === 0) return;
  try {
    execFileSync("git", ["add", ...files], { stdio: "ignore" });
    console.log(`sync-version: staged ${files.join(", ")}`);
  } catch {
    console.warn(
      `sync-version: could not stage ${files.join(", ")} — add them to the commit yourself.`,
    );
  }
}

function main() {
  const check = process.argv.includes("--check");
  let result;
  try {
    result = syncVersion({ check });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (result.drift) {
    for (const { file, found } of result.stale) {
      console.error(`sync-version: DRIFT — package.json=${result.version} but ${file}=${found}`);
    }
    console.error(
      "Run `npm run version:sync` (or bump with `npm version <x.y.z> --no-git-tag-version`) to fix.",
    );
    process.exit(1);
  }

  if (result.written.length === 0) {
    console.log(`sync-version: in sync (${result.version})`);
    return;
  }
  for (const file of result.written) {
    const found = result.stale.find((s) => s.file === file)?.found;
    console.log(`sync-version: ${file} ${found} -> ${result.version}`);
  }
  if (process.env.npm_lifecycle_event === "version") stageVersionCommit(result.written);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
