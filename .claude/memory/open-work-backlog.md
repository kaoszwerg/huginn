---
id: mem:open-work-backlog
title: Open follow-up work
tldr: "The five release blockers, plus the measurements that must settle the overlay, the webview's idle cost, the speech engine and the base model."
scope: project
load: conditional
triggers: [backlog, open, follow-up, todo, gap, upstream, defect, bug, blocker, next, saga, althing]
type: project
---

# Open follow-up work

Nothing here blocks development. All of it is tracked so it cannot quietly disappear.

## Release blockers

Five, tracked in `release-blockers.json` and enforced by `npm run release:check` (ADR-PROJ-002): the
publisher and bundle identifier, the Apple Developer account, the project licence, the trademark check,
and Huginn's own design system. Development is unaffected; a **bundled** build is not — the gate sits in
`beforeBuildCommand`, which both a local `tauri build` and the tag-triggered CI release run through.

## Known unknowns — to be settled by measurement, never by reasoning (ADR-CORE-004)

- **The overlay.** Is a focus-neutral, transparent, click-through window achievable on both platforms —
  and does the transparency survive a **bundled** macOS build (tauri#13415 reports it working in
  `tauri dev` and turning opaque in the DMG)? Phase 1 of `PLAN.md` answers it. If the answer is no,
  ADR-PROJ-001 and ADR-PROJ-004 are reopened **before** product code exists.
- **The webview's idle cost.** No credible published measurement exists for Tauri 2 — the numbers in
  circulation come from blog posts with no methodology. Measure it over ≥ 1 h on both platforms, with and
  without the overlay open (tauri#15471: a transparent window costs ~8× GPU power on macOS for as long as
  it exists).
- **The speech engine.** whisper.cpp vs. a streaming engine, decided by WER **and** latency on German test
  audio, on the maintainer's hardware — not by reputation (Phase 3).
- **The base model.** Which model is small enough to ship in the installer and still good enough in
  German. A benchmark decides; the licence goes into the SBOM.
- **macOS ad-hoc signing and TCC.** Whether the microphone and accessibility grants survive a rebuild
  while there is no Developer account. Expected to be painful; **not yet verified**, so not asserted.

## Resolved (kept for the next agent, who will otherwise wonder)

Two upstream defects were found while adopting saga on 2026-07-13, and **both were fixed at the root**
rather than worked around here:

- **Cross-layer supersession did not exist** — a project could not decline an upstream decision at all.
  Now it can: declare `supersedes: [<upstream id>]` in your own document (ADR-CORE-035, migration 005).
  Huginn uses it in ADR-PROJ-003 (retires ADR-APP-020), `rule:design-system` (retires `rule:theming`) and
  `mem:huginn-glossary` (retires `mem:glossary`). The upstream files stay pinned and keep receiving
  updates; `context-for.mjs` simply stops handing them to an agent.
- **`bootstrap.mjs` wrote the fork marker into the manifest instead of `governance/config.json`** and
  printed success anyway. Fixed upstream.

**Why:** the two defects above are the reason this project briefly carried workarounds, and the reason it
no longer does. If a future agent finds a governance mechanism that seems to make a legitimate change
impossible, the answer is the same as it was here: **report it upstream and fix it at the root.** A local
workaround is a lie the next consumer has to rediscover.

**How to apply:** never resolve a "known unknown" above by reasoning about it — measure it, and write the
measurement into the ADR that assumed it (ADR-CORE-004). And never close a release blocker by deleting its
entry; that is falsifying a record, not resolving it.
