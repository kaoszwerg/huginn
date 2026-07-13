---
id: ADR-CORE-024
title: Versioning (SSOT + SemVer) and dev/release build channels
status: accepted
tldr: "package.json is the version SSOT (synced into Cargo.toml + Cargo.lock, gated in check:all); every change bumps SemVer; releasing is a separate, instructed act."
scope: governance
load: conditional
triggers: [version, semver, release, bump, dev, release-build, channel, changelog, cargo-lock, locked]
applies-to:
  [
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
    "scripts/sync-version.mjs",
    "src-tauri/tauri.dev.conf.json",
  ]
supersedes: []
superseded-by: null
---

## Context

The version lived in three places (`package.json`, `tauri.conf.json`, `Cargo.toml`) with no single
source — drift-prone. And dev builds were indistinguishable from releases: same name, identifier and
app-data dir, so a dev build shared the release app-data (settings).

## Decision

**Single source of truth = `package.json`.** `tauri.conf.json` reads it via `"version": "../package.json"`;
`scripts/sync-version.mjs` writes it into `Cargo.toml`'s `[package]` version **and into the crate's own
`[[package]]` entry in `Cargo.lock`** — the gate and CI build with `--locked`, so a lock left behind
fails every Rust step ("cannot update the lock file … because `--locked` was passed"). `version:check`
runs in `check:all` and fails on drift in either file. The `npm` `version` lifecycle hook runs that sync
and stages what it wrote, so the bump cannot land half-applied.

**Versioning = SemVer**, derived from Conventional Commits: `feat:` → minor, `fix:`/`perf:`/`refactor:`
→ patch, a `!`/`BREAKING CHANGE` → major (pre-1.0: `feat:` → `0.(x+1).0`, fixes → `0.x.(y+1)`).
**Bumps follow the work, not the release:** every change that lands bumps the version by its commit
type, run as `npm version <major|minor|patch> --no-git-tag-version` *before* the commit, so the bumped
`package.json` and the synced `Cargo.toml`/`Cargo.lock` travel inside the same commit as the code that
earned them. The version therefore always states the state of the work — never "whatever the last
release was". A bump never commits and never tags.

**A released (tagged) version is final and closed.** A binary must never be built or shipped under an
already-released version — otherwise two different artifacts claim the same number and it is ambiguous
what a given build contains. **Releasing is a separate event that happens only on the maintainer's
explicit instruction** — never inferred from "make a build" or a finished feature: the agent moves
`## [Unreleased]` into a dated `## [X.Y.Z]` section, tags `vX.Y.Z` and pushes the tag, which triggers the
project's release pipeline; it then immediately reopens the next patch, so no subsequent build can reuse a
released number. (A fully automatic CI flow, e.g. release-please, was considered and deliberately
deferred — the maintainer keeps control of the release moment.)

**Build channels are explicit:**

- **Runtime + traceability:** `build_info` returns `{ version, channel, debug, git_sha, git_dirty,
  commit_date }`. `channel` is `dev` for a debug build (`tauri dev`) and `release` for an optimised build
  (`tauri build`) via `cfg!(debug_assertions)`; the git fields are embedded at compile time by `build.rs`.
  So **any build is traceable to an exact commit even between releases** (when the SemVer version is
  unchanged): the status bar shows `vX.Y.Z (sha)` + a **DEV** badge, and Settings → Build shows the full
  identity. `git_dirty` flags a build made with uncommitted changes.
- **Identity:** `tauri.dev.conf.json` (used by `npm run app:dev`) overrides `productName` → the app
  name suffixed with `" Dev"` and `identifier` → the release identifier suffixed with `.dev`, so a dev
  build has its own name **and its own app-data dir (settings)**, never colliding with a release install.

## Update — bumps decoupled from the release (2026-07-12)

This ADR originally decided the opposite trigger: *"bumps are release-triggered, not per commit — within
one open version the number is fixed across commits"*. That is superseded by the paragraph above, and the
history is kept here on purpose.

**Why it changed.** In practice the rule froze a whole product at its initial version: nothing releases
for weeks, so nothing bumps, and the version number stops carrying information — it says what was last
released, not what the work is. Traceability was supposed to be covered by the embedded `git_sha`, but a
version that never moves makes every intermediate build indistinguishable *by version*, which is what
humans actually read. Reported by a fork (`ivaldi`), ruled by the maintainer: **the version reflects the
work; the release is an act of the maintainer.** The two were conflated; they are now separate:

- **bump** = mechanical, per landing change, from the commit type — the agent does it unprompted;
- **release** = explicit maintainer instruction, dates the changelog and cuts the tag — the agent never
  infers it (an inferred release was exactly the failure that produced the old rule; the fix is the
  reopen-immediately clause, which stays in force, not a frozen version).

**Also fixed here:** the `version` lifecycle hook synced only `Cargo.toml`, never `Cargo.lock`. With
per-change bumps, that hits on *every* change instead of once per release: the next `--locked` build
(clippy/test/CI) dies with *"cannot update the lock file … because `--locked` was passed"*.
`scripts/sync-version.mjs` now writes and verifies both files (`version:check` in `check:all`), and the
briefing `docs/migrations/002-versioning-per-change.md` carries this to the forks.

## Alternatives

- **Keep three manual versions** — rejected: drift; the golden rule is one source.
- **Separate dev vs release only by version suffix** — rejected: same identifier still shares the
  app-data (settings).
- **Freeze the number within an open version, bump only at the release** (the original decision) —
  rejected in the Update above: it leaves a product stuck at its initial version and makes the number
  say nothing about the work.
- **Bump automatically from the commit message in a CI/pre-commit hook** — rejected: the type of a
  change is a judgement call (a `fix:` that breaks a boundary is a major), and an automated bump would
  fight the agent's own `npm version` run. The agent decides and runs it; `version:check` verifies.

## Consequences

- One place to bump; the gate guarantees `package.json`, `Cargo.toml` and `Cargo.lock` agree; dev and
  release are unmistakable and isolated.
- The version moves with the work, so any two builds differ by version; the embedded `git_sha` still
  pins the exact commit.
- The agent owns bumping end to end and never owns the release moment: tagging waits for the
  maintainer's instruction.

## References

- `.claude/rules/versioning.md`, `docs/migrations/002-versioning-per-change.md`, `CHANGELOG.md`.
- The propagation of the version into a stack's derived manifests, and the release pipeline that builds
  a tag, belong to the layer that owns the build (ADR-CORE-033).
