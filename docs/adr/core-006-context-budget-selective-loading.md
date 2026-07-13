---
id: ADR-CORE-006
title: Context budget — TLDR index + selective on-demand loading + compact-survival
status: accepted
tldr: "Boot loads only CLAUDE.md + TLDR indexes + core docs; full ADRs/rules load on demand via tldr/triggers/applies-to; hooks force a reload after compact."
scope: governance
load: core
triggers: [context, loading, tldr, manifest, hook, compact, budget]
applies-to: [".claude/**", "docs/adr/**", "CLAUDE.md"]
supersedes: []
superseded-by: null
---

## Context

Pinning every rule and ADR into the prompt burns the context budget and degrades reasoning; pinning
nothing makes the agent re-derive and contradict past decisions. After a context compaction the agent
can silently lose the ruleset entirely.

## Decision

Adopt **TLDR-driven selective loading**:

- **Boot:** read `CLAUDE.md`, the generated TLDR indexes (`docs/adr/manifest.json`,
  `.claude/rules/INDEX.md`, `.claude/memory/MEMORY.md`) and every `load:core` full text only.
- **Per task:** load a conditional document's full text **iff** its `tldr`, `triggers`, or `applies-to`
  globs match; `scripts/context-for.mjs` resolves the set deterministically. `archival` never auto-loads.
- **After compact/resume:** a matcher `SessionStart` hook runs `post-compact-reminder.sh` to force a
  reload of `CLAUDE.md` + indexes before continuing.

## Alternatives

- **Load everything always** — rejected: wastes budget, degrades quality.
- **Coarse load-tiers only (no tldr/triggers)** — rejected: too blunt; agent still guesses relevance.

## Consequences

- Resident context stays tiny; any decision is one `Read` away.
- Requires the front-matter (`tldr`/`triggers`/`applies-to`) and generated indexes to be present and
  current (enforced by ADR-CORE-007).

## References

- ADR-CORE-007 (generation), `.claude/rules/context-loading.md`, `scripts/context-for.mjs`,
  `.claude/settings.json`.
