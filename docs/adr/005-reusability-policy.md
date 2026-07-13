---
id: ADR-005
title: Reusability policy — no structural duplication, shared single sources
status: accepted
tldr: "Reuse over copy-paste; one source for cross-cutting concerns (ts-rs types, HUD theme, command wrappers) — no duplicated structure."
scope: global
load: core
triggers: [reuse, duplication, dry, component, ssot, types, theme]
applies-to: []
supersedes: []
superseded-by: null
---

## Context

Copy-pasted structure diverges over time and multiplies maintenance and bugs.

## Decision

Prefer reuse and extension over duplication. Cross-cutting concerns have exactly one source:
backend↔frontend types are generated once via `ts-rs`; the HUD palette + utilities live in
`src/styles/globals.css` + `src/styles/palette.ts`; the Tauri command surface is wrapped once in
`src/api/commands.ts`. Shared UI lives in `src/components/ui/`. A genuinely needed second copy
requires an ADR explaining why.

## Alternatives

- **Local copies for speed** — rejected: structural drift, the exact failure ADR-003 also guards
  against.

## Consequences

- Less code, consistent behaviour, single place to change.
- Requires discipline to extract shared pieces early.

## References

- ADR-003 (SSOT), `.claude/rules/reusability.md`. *Which* concerns a given stack has exactly one source
  of (its theme, its generated boundary types, its UI primitives) is recorded in the layer that owns them.
