---
id: mem:version-bump-trigger
title: "Bumps follow the work; releases follow the maintainer"
tldr: "Bump SemVer on every landing change (npm version <x> --no-git-tag-version, in the same commit); never tag or release unless the maintainer says so."
scope: governance
load: core
type: feedback
---

The agent owns versioning (ADR-024 + rule:versioning), and the two halves have **different triggers**:

- **Bump = the change.** Every change that lands bumps SemVer by its Conventional-Commit type —
  `feat:` → minor, `fix:`/`perf:`/`refactor:` → patch, `!`/`BREAKING` → major (pre-1.0: `feat:` →
  `0.(x+1).0`, fixes → `0.x.(y+1)`). Do it unprompted, *before* committing, with
  `npm version <major|minor|patch> --no-git-tag-version`, and let the bumped `package.json` — plus
  whatever manifests the project's sync script derives from it — ride in the same commit as the code.
- **Release = the maintainer's word.** Dating the changelog and cutting a `vX.Y.Z` tag happens **only**
  when the maintainer explicitly asks for a release. "Mach einen Build", "das ist fertig", "push das"
  are **not** release instructions — build and push, do not tag.

**Why:** two corrections, in this order. (1) The maintainer pulled me up after a build went out under an
already-released number, which produced the "a released tag is final — reopen the next patch at once"
rule (still in force). (2) The old fix over-corrected into "never bump per commit, only at the release
milestone" — a project then sat at `0.1.0` for its entire life, and the maintainer ruled that wrong: the
version must reflect the *work*, not the last release, while the release itself stays a deliberate,
human-triggered act. Inferring a release from "make a build" is the failure mode both corrections warn
about.

**How to apply:**

- Landing a change? Decide the bump from the commit type, run
  `npm version <x> --no-git-tag-version`, add the CHANGELOG entry under `## [Unreleased]`, commit
  everything together. Never `git tag` and never plain `npm version` (it tags).
- Asked for a build? Build — do not release. Say which version and which commit the artifact carries.
- Asked for a *release*? Move `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`, commit, tag `vX.Y.Z`, push
  with `--follow-tags`, then immediately reopen: `npm version patch --no-git-tag-version`.
- Never hand-edit a version in a derived manifest — the project's sync script owns them, and
  `check:all` fails on drift. Which files those are is a stack decision; that they may not diverge is not.

Related: [[mem:user-conventions]] (Conventional Commits + one-pass completeness).
