---
id: ADR-CORE-030
title: Portable governance core — versioned, hash-pinned, updatable across template forks
status: superseded
tldr: "SUPERSEDED by ADR-CORE-033: two layers became N ordered layers. The hash pin, drift gate and self-updating governance:update are retained there."
scope: governance
load: conditional
triggers: [template, fork, sync, governance-update, drift, manifest, core, bootstrap, portable]
applies-to: ["governance/**", "scripts/governance-manifest.mjs", "scripts/governance-update.mjs"]
supersedes: []
superseded-by: ADR-CORE-033
---

> **Superseded by [ADR-CORE-033](core-033-governance-layers-cascade.md).** Its two-layer model (one template-owned
> core, one project layer, role derived from `upstream === null`) could not express a repo that consumes
> one layer and publishes another — which is what `saga-rust-template` became once the agnostic core moved
> to `althing` and `ivaldi` stayed downstream of the app layer. Everything below still describes the
> mechanism accurately (hash pin, drift gate, opt-out, self-updating update); only "two layers" is now
> "N ordered layers". Read ADR-CORE-033 for the current model.

## Context

This repo is a reusable template. New projects are created from it (GitHub
template / degit) and must keep the *portable governance core* — the project-agnostic rules, ADRs,
scripts, config and CI — in sync with the template as it improves, **without ever overwriting** the
project's own domain code, ADRs, rules, name or settings. A plain fork diverges silently; we need an
explicit, verifiable boundary between "core" (synced) and "project" (diverges).

## Decision

- **Two layers.** `governance/manifest.json` lists the exact **core paths** and a content hash for
  each (reusing the ADR-CORE-007 hash idea). Everything not listed is the **project layer**, never touched
  by an update.
- **Layout.** The core line lives in `.claude/rules/*.md` and `docs/adr/NNN-*.md`; the **project line**
  in `.claude/rules/project/*.md` and `docs/adr/project/NNN-*.md` (numbers from 100). The same
  `governance:sync` / `check` scripts index and validate both; only the core line is in the manifest,
  so a project adds its own rules/ADRs to the project line and never edits the core in place.
- **Versioned.** The manifest carries a `governanceVersion` (= the template's release tag) and an
  `upstream` field: `null` in the template itself, the template's repo slug in a fork.
- **Drift-gate.** `scripts/governance-manifest.mjs --check` runs inside `governance:check`: it
  recomputes the core hashes and fails if a core file was edited locally (a fork must not edit core in
  place) or is stale (the template must re-pin). `--sync` re-pins **only** when `upstream` is null, so
  a fork's pins stay authoritative and a fork's own added files are ignored.
- **Update flow.** `scripts/governance-update.mjs --to <ref>` fetches the core paths from the template
  at `<ref>`, overwrites **only** those paths, re-runs sync + check, and records the new version — the
  maintainer reviews the `git diff` and commits.
- **The update self-updates first.** A fork runs its *own*, possibly outdated copy of the update logic
  while fetching the new one — so a fix to that logic would only take effect one update too late, which
  is precisely how a bug in it reaches every project. The script therefore refreshes `scripts/` from
  upstream and re-executes itself with the fresh logic before touching anything else.
- **Customising in a fork.** A project diverges from a core file **additively** (new, unlisted files),
  through a **project overlay** where the core provides one (`eslint.config.project.mjs`,
  `knip.project.json`), or by an explicit **opt-out** (`governance/opt-out.json`) — never a silent
  in-place edit. Which config is core, project-owned, overlayable or opt-out-able is ADR-CORE-032.

## Alternatives

- **Git submodule/subtree for the core** — rejected: relocates the rules/ADRs into a subdir and adds
  merge friction; the manifest+hash approach keeps files in place.
- **Copy-once, never sync** — rejected: governance improvements never reach existing projects.
- **npm package `@saga/governance`** — deferred: viable later for multi-team scale; the script-based
  pull needs no registry/publish step.

## Consequences

- One command (`governance:update`) carries template improvements into every project; the drift-gate
  makes silent divergence impossible.
- The template and its forks run the same `governance:check`; behaviour differs only by `upstream`.

## References

- ADR-CORE-003 (repo SSOT), ADR-CORE-006 (context loading), ADR-CORE-007 (generated indexes + hash gate),
  ADR-CORE-032 (config layering: which config is core, which is project-owned, overlay + opt-out),
  `.claude/rules/automation.md`.
