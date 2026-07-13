---
id: ADR-CORE-003
title: Repository is the single source of truth; memory is repo-resident
status: accepted
tldr: "All decisions/rules/memory live in the repo; agent memory sits in .claude/memory and is symlinked into the user memory dir, so there is one truth and no drift."
scope: governance
load: core
triggers: [memory, ssot, documentation, drift, symlink, governance]
applies-to: [".claude/memory/**", "docs/**"]
supersedes: []
superseded-by: null
---

## Context

Knowledge split between a developer's local Claude memory and the repository drifts: the agent trusts
stale, machine-local notes that a fresh clone never sees. Documentation that is hand-copied also drifts
from code.

## Decision

The **repository is the single source of truth**. Architectural decisions live in `docs/adr/`,
conventions in `CLAUDE.md`, behavioural rules in `.claude/rules/`, and durable project context in
`.claude/memory/` (committed). The per-user Claude memory directory is **symlinked** to the repo's
`.claude/memory/` by `scripts/setup-claude-memory.sh` (run from the `SessionStart:new` hook), so local
and repo memory are literally the same files. Every new duplication point requires its own ADR.

## Alternatives

- **Local-only user memory** — rejected: invisible to clones/CI, drifts from repo.
- **Manual copy between local and repo** — rejected: drifts immediately, no enforcement.

## Consequences

- One authoritative copy; a clone or CI sees the exact same governance the author does.
- The symlink setup must be idempotent and defensive (back up an existing real directory, never destroy).
- Indexes are generated, not hand-kept (ADR-CORE-007), to extend SSOT to the indexes themselves.

## References

- ADR-CORE-007 (generation + staleness), `.claude/memory/README.md`, `scripts/setup-claude-memory.sh`.
