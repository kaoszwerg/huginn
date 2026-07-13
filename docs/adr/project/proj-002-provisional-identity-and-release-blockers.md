---
id: ADR-PROJ-002
title: The publisher is undecided — the identity is provisional and the release build refuses to run
status: accepted
tldr: "Publisher, Apple account, licence, trademark and the design are deferred — release-blockers.json plus release:check refuse a bundled build until each is closed."
scope: architecture
load: conditional
triggers:
  [
    identity,
    identifier,
    bundle,
    vendor,
    publisher,
    release,
    licence,
    license,
    trademark,
    signing,
    notarization,
    apple,
    blocker,
  ]
applies-to:
  ["app.identity.json", "release-blockers.json", "scripts/project/check-release-ready.mjs"]
supersedes: []
superseded-by: null
---

## Context

Four decisions are genuinely open, and forcing them now would be guessing:

1. **Who publishes Huginn** — the company (`lysis.ai`) or the maintainer's own GitHub org. This fixes
   the bundle identifier.
2. **The Apple Developer Program** (~99 USD/year). It is unavoidable for *any* macOS distribution, App
   Store or not: notarisation needs a Developer ID certificate, and without it Gatekeeper blocks the app
   at the user's machine.
3. **The project licence** — it decides the `cargo-deny` allow-list and which dependencies may ever be
   used.
4. **The trademark/name check** the product brief itself demands (a prominent OSS project already
   carries the name Huginn).

None of them blocks development. **All of them block a release** — and the bundle identifier is the
dangerous one: once a user has installed the app, macOS keys the granted microphone and accessibility
permissions, the autostart entry and the data directory to it. Changing it *after* the first release
takes the user's permissions away and orphans their multi-gigabyte model.

The failure mode to design against is not "we decide wrong". It is **"we forget, and ship"**.

## Decision

- **A working identity is set now**: `ai.lysis.huginn` / vendor `lysis` — the only candidate that points
  at a domain that actually exists (the brief itself forbids inventing a company domain). It is marked
  provisional in `app.identity.json`, and changing it later is one value plus `npm run identity:sync`.
- **The data directories are deliberately NOT derived from the identifier** (ADR-PROJ-007). They are
  named `huginn`. The user's config, models and logs therefore survive a change of publisher; only the
  macOS permission grants have to be given again.
- **The deferral is enforced, not noted.** `release-blockers.json` (project-owned) lists every open
  decision, and `scripts/project/check-release-ready.mjs` **fails** while any entry is unresolved.
- **The gate sits on the release path, not in `check:all`.** A blocker must not redden every development
  build — that trains people to ignore the gate. It must stop exactly one thing: producing an artefact
  that could reach a user. `npm run release:check` runs it, and it is the first step of any release
  build.
- **Closing a blocker is an edit to a tracked file** (`"resolved": true` plus the decision), reviewed
  like any other change. Deleting an entry to make the build green is falsifying a record, in the same
  category as weakening a gate you do not own (rule:code-quality).

## Alternatives

- **Decide everything now** — rejected: it would be a guess on questions whose answers do not exist yet,
  and rule:clarify-and-plan forbids inventing decisions.
- **Write the open questions into a document** — rejected: this is exactly the failure
  rule:knowledge-handover §1 names. A checklist nobody is forced to read is a checklist that gets
  skipped on the day it matters. A gate cannot be skipped.
- **Put the check in `check:all`** — rejected: it would fail every commit from day one for a reason
  nobody can act on today, and a gate that is always red teaches the next agent to bypass gates.

## Consequences

- Development, dev builds and Windows work proceed unblocked.
- **No release artefact can be produced** until the four decisions are made — by design.
- macOS releases additionally wait on the Apple account. Until then macOS is developed and tested
  locally with ad-hoc signing; the granted permissions may have to be re-given on every rebuild
  (expected — to be confirmed in the first macOS spike, not asserted here).

## References

- ADR-PROJ-007 (storage layout), ADR-APP-031 (identity SSOT), ADR-APP-023 (release signing),
  rule:knowledge-handover, rule:clarify-and-plan.
