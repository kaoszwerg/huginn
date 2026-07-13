---
id: rule:versioning
title: Versioning & releases (agent-managed)
tldr: "Every landing change bumps SemVer by its commit type (npm version --no-git-tag-version); releasing/tagging only on the maintainer's word; package.json is SSOT."
scope: governance
load: conditional
triggers: [version, release, bump, semver, changelog, tag, released, reopen]
applies-to: ["package.json", "CHANGELOG.md"]
---

# Versioning & releases (ADR-024)

The agent owns versioning. Do not hand-edit versions in multiple files.

- **Bump per landing change — the trigger is the change, not the release.** Every change that lands
  bumps the version by its Conventional-Commit type; the number must always say what state the work is
  in, never what the last release was. A product that sits at `0.1.0` through fifty commits is the
  failure this rule prevents. Run the bump **before** committing:

  ```bash
  npm version <major|minor|patch> --no-git-tag-version
  ```

  `--no-git-tag-version` is mandatory: a bump **never** commits and **never** tags (that is the release,
  below). The bumped files ride in the same commit as the code that earned the bump, so version and
  content are one atomic change.
- **SemVer from the commit type:** `feat:` → minor, `fix:`/`perf:`/`refactor:` → patch,
  `!`/`BREAKING CHANGE` → major. Pre-1.0: `feat:` → `0.(x+1).0`, `fix:`/`perf:`/`refactor:` →
  `0.x.(y+1)`. A change carrying several types takes the highest. `docs:`/`chore:`/`test:`-only changes
  do not bump.
- **A release is a separate event and happens only on the maintainer's explicit word.** Never infer it
  from "make a build", "ship it" or a finished feature — those are builds, not releases (the maintainer
  decides). The release: move `## [Unreleased]` into a dated `## [X.Y.Z] - YYYY-MM-DD` section
  (Keep a Changelog), commit, `git tag vX.Y.Z`, `git push --follow-tags`. Pre-1.0 stays `0.y.z`.
- **A released tag is final — reopen immediately (HARD RULE).** A tagged `vX.Y.Z` is closed: never
  build, ship or keep working under an already-released version, or two different artefacts claim the
  same number. **The instant a release is cut, bump the working version to the next patch**
  (`npm version patch --no-git-tag-version`) so every subsequent build carries a new, *unreleased*
  number. If the working version still equals the last released tag, bump first, before any further
  build.
- **SSOT:** `package.json` holds the version. Any other manifest that needs it (a language-specific
  manifest, a lockfile, a build config) is **derived by a sync script and gated in `check:all`** — never
  hand-edited, never allowed to drift. Which files those are is a stack decision; that they may not
  diverge is not.
- **Changelog:** record each change under `## [Unreleased]` as it lands (that section is the accumulator
  between releases); it is emptied into the dated section at release time.
- **Channels:** a development build is never a release. Say which one you produced — a debug/dev artefact
  is labelled as such and must never be presented to the maintainer as a release build.
- **Traceability:** a build embeds the git commit it came from. Between two releases the version moves
  with the work, but the commit SHA is what pins a build to an exact state — quote it when saying what is
  in a build.

**The propagation mechanism is a stack decision** (which manifests, which lockfile, which build config,
how a release is produced). On a stack that has one, its own layer carries it — load that rule when you
touch the version plumbing.
