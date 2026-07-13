---
id: ADR-002
title: Always the best solution, never the easiest
status: accepted
tldr: "Best, senior-level, production-grade — no shortcuts or unfinished leftovers; fix, never silently remove a feature (removal needs the owner's consent)."
scope: global
load: core
triggers: [principle, quality, shortcut, architecture, decision, remove, removal, delete, fix]
applies-to: []
supersedes: []
superseded-by: null
---

## Context

The maintainer requires professional, production-grade quality. Shortcuts and "pragmatic moonshots"
create technical debt and misunderstandings that are explicitly unacceptable.

## Decision

Every implementation must choose the **best** solution, not the fastest or simplest:

- No quick-and-dirty workarounds when a clean solution is possible; no "good enough for now".
- Architecture is considered thoroughly; code is written as if it ships to production immediately.
- **Everything is implemented in one pass** — no stubs, no "later", nothing left "optional". Half-built
  or optional-but-unfinished work builds debt and misunderstanding and is forbidden.
- **Fix, don't remove.** When a feature misbehaves, the default is to **repair** it — never delete it or
  silently downgrade it to a lesser stand-in to dodge the fix (replacing a broken capability with a
  static/inferior placeholder counts as removal). A feature is removed **only** with the owner's explicit
  consent; the owner decides whether removal is even on the table. When a fix is hard, surface the problem
  and ask — do not quietly drop the feature.
- **Fix on sight, regardless of origin.** Every bug discovered is fixed as part of the current work —
  it is irrelevant whether this session, an earlier session or a previous author introduced it; origin
  is never grounds to ignore or defer it. If a fix is genuinely out of scope or risky, it is surfaced
  and tracked immediately (never left silent), per the plan-gate (rule:clarify-and-plan).
- **Senior-level by default, without exception.** Every task — whether executed by the main agent or a
  delegated subagent — is done to senior-specialist standard and framed in that persona; drop below it
  only when a lighter level is demonstrably the better fit, never as a shortcut. (ADR-022)
- Applies to architecture, error handling, edge cases, UI/UX, security, tests and documentation alike.

## Alternatives

- **Iterative "MVP first, harden later"** — rejected: leaves known gaps that rot and mislead future work.

## Consequences

- Work may take longer but produces maintainable, correct code with no deferred clean-up.
- Every agent evaluates multiple approaches and justifies the chosen one.
- A broken feature is repaired, not stripped; the maintainer is asked **before** anything is removed and
  decides whether removal is acceptable at all.

## References

- ADR-004 (verify first), ADR-005 (reusability), ADR-010 (testing), `.claude/rules/code-quality.md`.
