---
id: rule:stack-release
title: Version sync, build channels and releases for the Tauri stack
tldr: "The core's version policy, executed here: package.json → Cargo.toml + Cargo.lock, tauri dev/build channels, identity SSOT, tag-driven cross-platform release."
scope: governance
load: conditional
triggers:
  [
    version,
    release,
    bump,
    semver,
    tag,
    channel,
    cargo-lock,
    locked,
    identity,
    rename,
    productname,
    identifier,
    signing,
    notarize,
    tauri-action,
  ]
applies-to:
  [
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.dev.conf.json",
    "app.identity.json",
    "scripts/sync-version.mjs",
    "scripts/sync-identity.mjs",
    ".github/workflows/release.yml",
  ]
---

# Version, channels and releases — the Tauri mechanism (app layer)

The **policy** is rule:versioning (core): every landing change bumps SemVer by its commit type; a release
happens only on the maintainer's explicit word; a released tag is final. This file is how that policy is
**executed on this stack** — the files, the commands, the traps.

## The version SSOT is propagated, not copied

`package.json` is the single source (rule:versioning). `scripts/sync-version.mjs` writes it into:

- `src-tauri/Cargo.toml` — `[package] version`
- `src-tauri/Cargo.lock` — the crate's own `[[package]]` entry

`tauri.conf.json` reads `package.json` directly. **Never hand-edit a version in any of them.**

**The lock is not optional.** The gate and CI build with `--locked`, so a bumped `Cargo.toml` with a stale
lock fails *every* Rust step with _"cannot update the lock file … because --locked was passed"_.
`npm run version:check` runs inside `check:all` and fails on drift in **either** file.

```bash
npm version <major|minor|patch> --no-git-tag-version   # bumps package.json, syncs + stages Cargo.toml/Cargo.lock
```

`--no-git-tag-version` is mandatory: a bump never commits and never tags. The synced files ride in the
same commit as the code that earned the bump.

## Identity has one source too (ADR-APP-031)

The app name/identifier lives once in `app.identity.json`; `npm run identity:sync` propagates it into
`package.json`, `src-tauri/Cargo.toml`, both tauri configs, `src/lib/app.ts`, `index.html` and the Rust
crate references. `identity:check` gates the drift in `check:all`. Renaming a fork means editing that one
file — never the name in eight places.

## Channels

- `npm run app:dev` / `tauri dev` → **dev** channel: debug build, `" Dev"`-suffixed name, `….dev`
  identifier, separate app-data dir, DEV badge. **Never call a dev build a release.**
- `tauri build` → **release** channel.

Every build embeds its git commit (`build_info` → `git_sha` / `git_dirty` / `commit_date`, set by
`build.rs`). The version moves with the work; the `git_sha` is what pins a build to an exact commit —
quote it when saying what is in a build.

## Cutting a release (ADR-APP-023) — only when the maintainer says so

1. Move `## [Unreleased]` in `CHANGELOG.md` into a dated `## [X.Y.Z] - YYYY-MM-DD` section.
2. Commit, `git tag vX.Y.Z`, `git push --follow-tags`.
3. `release.yml` builds the cross-platform matrix (macOS arm+intel, Linux, Windows) via `tauri-action`
   and drafts the release. macOS is signed + notarised when the `APPLE_*` secrets are set, unsigned
   otherwise.
4. **Immediately bump the working version** (`npm version patch --no-git-tag-version`). A tagged version
   is closed — building on under it would let two different binaries claim the same number
   (rule:versioning, HARD RULE).

**Why this is a separate rule:** the policy is portable — any project bumps per change and releases on
the maintainer's word. `Cargo.lock`, `tauri.conf.json` and `tauri-action` are not. Keeping the mechanism
here is what lets the core govern a project that has no Cargo at all (ADR-CORE-033).
