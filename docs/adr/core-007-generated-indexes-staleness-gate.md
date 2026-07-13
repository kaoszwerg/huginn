---
id: ADR-CORE-007
title: Generated indexes + staleness gate
status: accepted
tldr: "One generator builds all indexes from doc front-matter; a content-hash scanner fails CI on drift."
scope: governance
load: core
triggers: [generator, index, manifest, staleness, hash, sync]
applies-to: ["scripts/**", "docs/adr/**", ".claude/**"]
supersedes: []
superseded-by: null
---

## Context

Hand-maintained indexes (README tables, manifests, snapshots) drift from the source documents.

## Decision

The source `.md` files are the only truth. **`scripts/sync-index.mjs`** is the single generator: it
reads front-matter and (re)writes `docs/adr/manifest.json`, `docs/adr/README.md`,
`docs/adr/current/README.md`, `.claude/rules/INDEX.md`, and `.claude/memory/MEMORY.md`.
**`scripts/check-index.mjs`** fails (non-zero) on: missing `id/title/tldr/scope/load`; `tldr` > 160
chars; a stale index (front-matter content-hash mismatch); a dead link; or a dangling
`superseded-by`. Both run in `check:all` and CI.

The portable governance blueprint that documents this system across projects is maintained in the
upstream repo it originated in; this repo does not carry a local copy, and the generator silently
skips it if absent.

## Alternatives

- **Hand-kept indexes with a strict process** — rejected: still drifts; humans forget.
- **Carry a local blueprint copy** — rejected: would diverge from the upstream and add
  maintenance overhead for no benefit in this project.

## Consequences

- Indexes can never silently drift.
- Marker-based generation stays deterministic and idempotent.

## References

- ADR-CORE-003 (SSOT), ADR-CORE-006 (loading), `scripts/sync-index.mjs`, `scripts/check-index.mjs`.
