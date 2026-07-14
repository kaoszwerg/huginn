---
id: rule:automation
title: Automation & CI policy
tldr: "Verification is LOCAL and complete: check:all as pre-commit + pre-push, nothing pushed unproven. GitHub builds final releases at a tag — and nothing else."
scope: governance
load: conditional
triggers: [ci, automation, workflow, pipeline, merge, gate, hooks, pre-commit, pre-push, release]
applies-to: [".github/**", "package.json", "scripts/**"]
---

# Automation & CI policy (ADR-CORE-008)

- **Verification is local, and it is the whole gate.** `check:all` runs as a **pre-commit** (fast,
  staged-file-scoped) and a **pre-push** (full gate) git hook. There is no second opinion: nothing is
  pushed that was not proven on the machine that wrote it.
- **Nothing pushed unproven.** A push happens only after the full gate is green locally, enforced by the
  pre-push hook. `--no-verify` and skipping gate steps to force green are prohibited
  (rule:git-workflow). "Green before it lands on `main`" is proven by that hook — **not** by a remote run.
- **The remote builds releases, and nothing else.** Its only job is producing the **final** artefacts at a
  version tag, on every platform the product ships to, with whatever signing that needs. There is **no**
  push- or PR-triggered workflow that re-runs `check:all`. Remote compute produces artefacts; it does not
  re-check a gate that has already passed (rule:versioning).

  **The premise, said out loud, because it is what makes this safe:** a platform-specific break is not
  *unnoticed* — it surfaces in the **release build**, which runs on every platform the product ships to.
  That build is the backstop. The push pipeline was only ever re-deriving, on someone else's computer, what
  the pre-push hook had established a minute earlier.

- **A repo that ships no artefact has no such backstop — and is therefore not what this rule is about.**
  A repo that publishes only *governance* or *tooling* (no release, no tag build, no platform matrix) has
  nowhere for a platform break to surface later. There, a run on a platform nobody develops on is **not a
  repetition of the local gate — it is the only coverage that exists**, and it is legitimate.

  This is a scope statement, not an exception, and it opens nothing: **any repo that builds a release
  already has the backstop, so it may not use this to justify a push pipeline.** The test is simply: does
  this repo produce an artefact? If yes, the release build catches it, and there is no push CI.
- **Dependency & security cadence.** Dependencies stay at latest stable (ADR-CORE-009); the supply-chain
  and secret scanners run inside `check:all`, so a finding blocks the **push**, not a later pipeline
  (rule:security).

## The cost of this, stated plainly

Without a push gate, **a break that only appears on another platform is not caught until release
time** — a Linux-only build dependency, a case-sensitive path, a toolchain that behaves differently
there. Nothing in the local run can see it.

That is **accepted, not overlooked.** The maintainer builds and tests locally before pushing, and the
release build is where a cross-platform break surfaces. The alternative — a push-triggered pipeline
re-running a gate that already passed, burning remote compute on every commit to tell you what your own
machine told you a minute ago — was judged to cost more than it returns. It also decays: people stop
trusting the local run and start pushing to *see whether CI goes green*, which is exactly the habit the
pre-push hook exists to prevent.

Two things follow, and a future agent must not "fix" either of them by adding CI back:

- **Do not add a push- or PR-triggered workflow.** If the local gate is missing something, strengthen the
  local gate — that is where the coverage belongs.
- **A platform-specific problem belongs to the layer that has the platform.** A native build dependency
  that only one project needs rides in **that project's** layer, not in the template's release workflow,
  where it would be installed for every consumer that does not need it (rule:upstream-changes).
