---
id: ADR-CORE-008
title: Unified quality pipeline (check:all), pre-commit and CI
status: accepted
tldr: "One check:all gate (TS + Rust + governance) runs locally via pre-commit + pre-push; CI is last-line backstop and builds only final releases, never dev builds."
scope: governance
load: core
triggers: [ci, lint, test, pipeline, husky, quality, gate, coverage]
applies-to: [".github/**", "package.json", "scripts/**"]
supersedes: []
superseded-by: null
---

## Context

Two toolchains (Cargo + npm) and strict quality requirements need one consistent, enforced gate that is
identical locally and in CI, with no silent regressions.

## Decision

A single **`check:all`** runs both sides and the governance checks:

- **TS:** `tsc --noEmit`; ESLint flat config with `--max-warnings 0` (plugins: security, no-secrets,
  react-hooks, jsx-a11y, import); Prettier check; Vitest with coverage; `knip` (dead code); `secretlint`.
- **Rust:** `cargo fmt --check`; `cargo clippy -- -D warnings`; `cargo test`; `cargo-deny check`;
  `cargo audit`; `cargo-llvm-cov` (coverage).
- **Governance:** `check-index.mjs` + `lint-memory.mjs`.
- **Commits:** commitlint (Conventional Commits), enforced via husky/lint-staged.

**Local-first, CI as last line of defense.** Everything is caught during development *before* it
reaches GitHub: `check:all` runs as a git **pre-commit** (fast, lint-staged-scoped) and **pre-push**
(full gate) hook, and nothing is pushed that is not green locally (`--no-verify` forbidden). GitHub CI
does **not** own verification that belongs locally — it re-runs the same `check:all` only as the **last
line of defense** (environment drift), and otherwise runs only genuinely CI-only work: the
cross-platform **build and release of final versions** at a tag. CI never produces dev or intermediate
builds. Merges to `main` require a green gate.

## Alternatives

- **Lint/test only in CI** — rejected: slow feedback, broken commits land locally.
- **CI builds every push (dev/intermediate builds)** — rejected: verification is already local; CI
  builds only final tagged releases. *How* a release is built is a stack decision and lives in the layer
  that owns the build.
- **Separate ad-hoc scripts per concern** — rejected: drifts, easy to skip.

## Consequences

- Consistent, enforced quality; every push verified the same way.
- Pre-commit must stay fast enough not to be bypassed (lint-staged scopes to changed files).

## References

- ADR-CORE-002 (best solution), ADR-CORE-009 (deps), ADR-CORE-010 (testing), `.github/workflows/ci.yml`.
