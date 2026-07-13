---
id: rule:automation
title: Automation & CI policy
tldr: "Local-first: check:all runs pre-commit + pre-push and nothing unproven is pushed; CI is a backstop that mirrors the same gate and blocks a red merge to main."
scope: governance
load: conditional
triggers: [ci, automation, workflow, pipeline, merge, gate, hooks, pre-commit, pre-push]
applies-to: [".github/**", "package.json", "scripts/**"]
---

# Automation & CI policy (ADR-CORE-008)

- **Local-first — CI is the last line of defence.** Everything is caught during development *before* it
  reaches the remote: `check:all` runs as a **pre-commit** (fast, staged-file-scoped) and a **pre-push**
  (full gate) git hook. CI does **not** own work that belongs in a local hook — it re-runs the same
  `check:all` as a backstop against environment drift, nothing more.
- **Nothing pushed unproven.** A push happens only after the full gate is green locally (enforced by the
  pre-push hook). `--no-verify` and skipping gate steps to force green are prohibited
  (rule:git-workflow).
- **Merges to `main` require green.** A red gate blocks a merge; CI is never a weaker subset of the local
  gate.
- **CI builds releases, not development artefacts.** CI's build role is the *final* version at a tag,
  with whatever signing the platform needs. Development and intermediate builds stay local
  (rule:versioning).
- **Dependency & security cadence.** Dependencies stay at latest stable (ADR-CORE-009); the supply-chain and
  secret scanners in the gate are the automated check, and a finding blocks the push (rule:security).
- **Reusable, not copied.** CI is defined as a reusable workflow the owning layer publishes and its
  consumers reference — so a pipeline fix reaches every project through `governance:update`, not
  copy-paste.
- **A repo's own CI is not published.** The workflow that gates *this* repo is excluded from what it
  ships downstream (`exclude` in `governance/config.json`, ADR-CORE-033) — a consumer inherits the governance,
  not the maintainer's build matrix.
