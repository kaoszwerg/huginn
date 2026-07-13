---
id: ADR-APP-031
title: App-identity single source of truth (app.identity.json) with sync + drift gate
status: accepted
tldr: "The app name/identifier lives once in app.identity.json; identity:sync propagates it everywhere; identity:check gates drift so it can't diverge."
scope: governance
load: conditional
triggers: [identity, name, rename, bootstrap, productname, identifier, ssot, app-name]
applies-to: ["app.identity.json", "scripts/sync-identity.mjs"]
supersedes: []
superseded-by: null
---

## Context

The app's display name, binary name, package name, crate name and bundle identifier appeared hardcoded
in ~26 places across three ecosystems (npm, Cargo, Tauri) plus source and tests. Renaming — which every
fork does at bootstrap — meant editing all of them, and they could silently drift apart. ADR-CORE-005
(reuse) and the version SSOT (`package.json` → `sync-version` → `Cargo.toml`, ADR-CORE-024) call for one
source.

## Decision

- **One source:** `app.identity.json` holds `displayName`, `binaryName`, `packageName`, `crateName`,
  `identifier`, `vendor`, `tagline`, `description`. It is the ONLY place a human or the bootstrap edits
  the identity. It is **project-specific** (not part of the portable core, ADR-CORE-030) — each project owns
  its own.
- **Propagation:** `scripts/sync-identity.mjs` writes the derived values into `package.json`,
  `src-tauri/Cargo.toml`, `tauri.conf.json` + `tauri.dev.conf.json`, `src/lib/app.ts`, `index.html`,
  and the crate references in `main.rs` / `tests/contracts.rs`. Edits are value-level, so Prettier and
  the gate agree.
- **No hardcoding at runtime:** Rust reads the display name from `app.package_info().name` (tray,
  startup log) and the crate name from `env!("CARGO_CRATE_NAME")` (log filter); the frontend and its
  tests read `APP_NAME` from `src/lib/app.ts`. Nothing hardcodes the literal name.
- **Drift gate:** `identity:check` runs in `check:all` and fails if any derived location no longer
  matches `app.identity.json` — the identity cannot silently diverge.
- **Bootstrap:** `/bootstrap` edits `app.identity.json` once and runs `identity:sync`.

## Alternatives

- **Hand-edit each location** — rejected: ~26 edit sites, drift-prone, brittle bootstrap.
- **A single manifest all tools read** — impossible: npm, Cargo and Tauri each parse their own file;
  propagation from one source is the pattern (as with the version SSOT).

## Consequences

- Bootstrap and every rename touch one file; drift is impossible (gated); the identity stays DRY.

## References

- ADR-CORE-005 (reuse), ADR-CORE-024 (version SSOT), ADR-CORE-030 (portable core), `scripts/sync-identity.mjs`.
