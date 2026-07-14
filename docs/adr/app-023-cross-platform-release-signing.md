---
id: ADR-APP-023
title: Cross-platform release builds + optional macOS signing
status: accepted
tldr: "tauri-action matrix builds macOS (arm+intel), Linux and Windows on tag/dispatch; macOS is signed+notarised when APPLE secrets are set, else unsigned."
scope: governance
load: conditional
triggers: [release, ci, build, signing, notarize, macos, tauri-action]
applies-to: [".github/workflows/release.yml", "docs/releasing.md"]
supersedes: []
superseded-by: null
---

## Context

The app must ship installable artifacts for macOS, Windows and Linux. macOS distribution outside the
App Store requires a Developer ID Application certificate plus notarisation; those credentials are the
maintainer's and live only as CI secrets.

## Decision

A separate `release.yml` workflow runs `tauri-action` in a platform matrix (macOS aarch64 and x86_64,
Linux, Windows) on a `v*` tag or manual dispatch, attaching artifacts to a **draft** GitHub release.
macOS builds are **signed and notarised automatically when the Apple secrets are present**
(certificate, identity, Apple ID, app-specific password, Team ID); when absent the build still succeeds
**unsigned** (ad-hoc). This keeps the pipeline working without secrets while enabling proper signing
when the maintainer provides them.

**This is the only workflow.** The quality gate (`check:all`) is not run here and not run anywhere on the
remote: it runs **locally**, as pre-commit + pre-push, and that is the whole gate (ADR-CORE-008,
rule:automation). `ci.yml` — which re-ran `check:all` on every push and pull request — was deleted; remote
compute produces release artefacts, and nothing else. The accepted cost is that a break which only appears
on another platform surfaces **here**, at release time.

## Alternatives

- **Sign in this repo without secrets** — impossible: signing needs the maintainer's private cert.
- **Fail the build when unsigned** — rejected: blocks contributors/CI without the certs.

## Consequences

- Reproducible cross-platform artifacts; signing is opt-in via secrets (documented in
  `docs/releasing.md`).
- The agent cannot itself sign builds (no credentials); it prepares the pipeline only.

## References

- ADR-CORE-008 (quality pipeline/CI), `.github/workflows/release.yml`, `docs/releasing.md`.
