---
id: rule:core-principles
title: Core principles
tldr: "Best solution only, verify everything, repo SSOT, reuse, security & tests, log everything, one-pass, fix don't remove, hand the knowledge over."
scope: global
load: core
triggers: [principle, start, overview]
applies-to: []
---

# Core principles (always in effect)

1. **Best solution, never the easiest.** No shortcuts; production-grade from the first commit.
   **Senior-level by default on everything** — tackle each task, and brief every subagent, in the
   voice of a senior specialist for that domain — unless a lighter level is demonstrably the better
   fit. (ADR-002, ADR-022)
2. **Verify first, never guess.** Every claim provable (source/test/measurement); unverified → marked
   "open", never asserted. (ADR-004)
3. **Repo is the single source of truth.** Decisions in ADRs, conventions in CLAUDE.md, rules here,
   durable context in `.claude/memory/`; keep docs current in the same change. (ADR-003)
4. **Reuse over duplication.** One source for every cross-cutting concern — shared types, theme,
   utilities. A justified second copy needs an ADR. (ADR-005)
5. **Selective context loading.** Boot light, load full docs on demand; reload after compact. (ADR-006)
6. **Security & tests are not optional.** Validated inputs, secret redaction, least-privilege
   capabilities; **test-first** unit tests from the first module (TDD). (ADR-011, ADR-010)
7. **Log everything, in every component.** Detailed structured logging is mandatory for debugging: every
   command, request and long-running task logs the action it performs and its result — start, progress,
   outcome, and every error with context. No component is silent, no failure is swallowed. Never log
   secrets or user content. (rule:logging carries the mechanism for the stack in use.)
8. **One pass, no leftovers.** Implement fully — no stubs, no "later", nothing "optional". (ADR-002)
9. **Fix, don't remove — and fix on sight.** A misbehaving feature is **repaired**, never deleted or
   silently downgraded to dodge the fix. **Every bug you find is fixed now, regardless of which session
   (current or earlier) introduced it** — origin is never an excuse to ignore or defer it; if a fix is
   genuinely out of scope, surface and track it immediately, never silently. Removal happens **only** with
   the maintainer's explicit consent — the maintainer decides whether removal is even an option. When a
   fix is hard, surface it and ask; do not quietly drop the feature. (ADR-002)
10. **The UI is never a default.** Where a project has a design system, every interactive control is a
    reusable primitive from it — never a native/unstyled element restyled in place, and never a
    third-party component library. UI/UX breaks are unacceptable and are lint-gated. The design system
    itself is a project/app-layer decision; the *ban on defaulting* is not. (ADR-005)
11. **Hand the knowledge over — proven, not hoped.** Every mechanism you introduce or change will be
    met by an agent who was not here: in a downstream project, after a compact, in a subagent. Enforce it
    in the gate where it can be enforced, place it where that agent actually loads it (matching *their*
    keywords), and **prove** the reachability with `scripts/context-for.mjs` before declaring done. A rule
    nobody loads is a comment, not governance; a chat message is not a handover.
    (rule:knowledge-handover, ADR-006, ADR-022)

When a principle cannot be honoured, stop and surface it; do not work around it.
