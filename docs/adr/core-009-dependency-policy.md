---
id: ADR-CORE-009
title: Dependency policy — latest stable everything, verified, lockfiles committed
status: accepted
tldr: "Latest stable of every dependency (verified vs crates.io/npm), lockfiles committed — current versions minimise known CVEs and avoid an update cycle."
scope: governance
load: core
triggers: [dependency, version, crate, npm, security, supply-chain, lockfile, cve]
applies-to: ["Cargo.toml", "package.json", "src-tauri/Cargo.toml"]
supersedes: []
superseded-by: null
---

## Context

Bleeding-edge (pre-release) versions cause breakage; but shipping **older** stable versions is just as
bad — they carry known security vulnerabilities and force an immediate update cycle right after
bootstrap. The goal is to start on the most current, secure baseline.

## Decision

- Use the **latest stable** release of **every** dependency at adoption time — direct, and transitive
  as far as constraints allow — including the current major. **No** alpha/beta/rc/pre releases.
- **Rationale (grundregel):** current versions minimise known CVEs and prevent an immediate
  post-bootstrap security-update cycle.
- **Verify every version against crates.io / npm before pinning** (no guessed versions — ADR-CORE-004); pin
  direct dependencies to explicit, visible versions.
- **Commit lockfiles** (`Cargo.lock`, `package-lock.json`) for reproducible builds.
- **Transitive pins outside our control are documented, not worked around.** Example (verified):
  `crypto-common v0.1.7` forces `generic-array =0.14.7`, so 0.14.9 cannot be selected; this is recorded
  rather than hidden.
- Supply chain is checked continuously: `cargo-deny` (advisories/licences/bans/yanked) + `cargo audit`;
  `npm audit`; `secretlint` + `eslint-plugin-no-secrets`. Dependabot/Renovate behind the CI gate keeps
  the baseline current over time.

## Alternatives

- **Caret ranges with a lagging lockfile** — rejected: silently ships older transitive versions with
  known CVEs, triggering an immediate update cycle.
- **Freeze versions and never update** — rejected: accumulates security debt.
- **Track only "mature" majors with a delay** — rejected: deliberately runs behind latest stable,
  against the grundregel above.

## Consequences

- Reproducible, auditable builds on the most current secure baseline; minimal immediate update churn.
- A periodic, gated update cadence keeps it current; unavoidable upstream pins are explicitly tracked.

## References

- ADR-CORE-004 (verify), ADR-CORE-008 (pipeline), ADR-CORE-011 (security).
