---
id: ADR-CORE-008
title: Unified quality pipeline (check:all), pre-commit and CI
status: accepted
tldr: "One check:all gate runs locally via pre-commit + pre-push and is the WHOLE gate; GitHub builds final releases at a tag and runs no push-/PR-triggered check."
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

**Verification is local, and it is the whole gate.** `check:all` runs as a git **pre-commit** (fast,
lint-staged-scoped) and a **pre-push** (full gate) hook. Nothing is pushed that was not proven green on
the machine that wrote it (`--no-verify` forbidden). "Green before it lands on `main`" is proven by that
hook.

**The remote builds releases, and nothing else.** Its only job is producing the **final** artefacts at a
version tag — every platform, whatever signing that needs. There is **no** push- or PR-triggered workflow
re-running `check:all`. Remote compute produces artefacts; it does not re-check a gate that has already
passed a minute earlier on the developer's machine.

### The premise this rests on — and the one repo it does not cover

A platform-specific break is not *unnoticed*: it surfaces in the **release build**, which runs on every
platform the product ships to. **That build is the backstop**, and it is what makes dropping the push
pipeline safe rather than merely cheaper.

Which means the rule has a boundary, and it must be stated or someone will misapply it: **a repo that
ships no artefact has no release build, and therefore no backstop.** A repo publishing only governance or
tooling — no tag build, no platform matrix — has nowhere for a platform break to surface later. There, a
run on a platform nobody develops on is **not a repetition of the local gate; it is the only coverage that
exists**, and it is legitimate.

This is a scope statement, not an exception, and it opens no door: **any repo that builds a release
already has the backstop and may not invoke this.** The test is one question — *does this repo produce an
artefact?* If yes, there is no push CI.

(It is not hypothetical. The governance hashes documents; a Windows working tree holds CRLF and a Linux
runner holds LF, so the same file hashed differently there and the staleness gate failed in CI on every
push while `check:all` was green locally. Nothing on the maintainer's machine could see it. That class of
defect propagates into **every consumer**, and in a repo with no release build, nothing else would ever
have caught it.)

### The accepted cost

For a repo that *does* ship: **a break that only appears on another platform is not caught until release
time** — a Linux-only build dependency, a case-sensitive path, a toolchain that differs there. The local
run structurally cannot see it.

This is deliberate. The maintainer builds and tests locally before pushing; the release build is where a
cross-platform break surfaces. A future agent must not "fix" this by re-adding a push pipeline: if the
local gate is missing something, **strengthen the local gate** — that is where the coverage belongs.

## Alternatives

- **A push-/PR-triggered CI that re-runs `check:all`** — this ADR used to mandate it, as a "backstop
  against environment drift". **Rejected now.** It burns remote compute on every commit to re-derive a
  result the pre-push hook produced a minute earlier, and it decays into the *real* gate: people stop
  trusting the local one and start pushing to "see if CI is green", which is precisely the habit the
  pre-push hook exists to prevent. The one thing it genuinely bought — catching a platform-specific break
  early — is stated above as an accepted cost, not pretended away.
- **Lint/test only in CI** — rejected: slow feedback, broken commits land locally.
- **CI builds every push (dev/intermediate builds)** — rejected: verification is already local; the remote
  builds only final tagged releases. *How* a release is built is a stack decision and lives in the layer
  that owns the build.
- **Separate ad-hoc scripts per concern** — rejected: drifts, easy to skip.

## Consequences

- Consistent, enforced quality; every push verified the same way, on the machine that made it.
- Pre-commit must stay fast enough not to be bypassed (lint-staged scopes to changed files), and the
  pre-push gate must stay complete — it is now the only gate there is.
- A platform-specific build dependency belongs to the layer that has the platform: a native library only
  one project needs rides in **that project's** layer, never in a template's release workflow.

## References

- ADR-CORE-002 (best solution), ADR-CORE-009 (deps), ADR-CORE-010 (testing), `rule:automation`,
  `rule:versioning`. The release workflow itself is a stack decision, owned by the layer that builds.
- Migration briefing: [`docs/migrations/core-006-no-push-ci.md`](../migrations/core-006-no-push-ci.md).
