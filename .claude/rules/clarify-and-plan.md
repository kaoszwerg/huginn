---
id: rule:clarify-and-plan
title: Clarify & plan before implementing
tldr: "Non-trivial work: plan first, surface unknowns, and resolve ambiguous decisions with the maintainer (AskUserQuestion) before coding — never guess a decision."
scope: governance
load: core
triggers: [plan, clarify, ambiguous, decision, question, requirement, unknown, ask, scope]
applies-to: []
---

# Clarify & plan before implementing

- **Decide before building.** For any non-trivial change, first produce a short plan, list every open
  question and every decision the change depends on, and resolve them **before** implementation starts.
  Implementation does not begin while a blocking decision is unresolved.
- **Ambiguous decision → ask, don't assume.** `no-guessing` forbids inventing *facts*; this rule
  extends it to *decisions*: when intent, scope or approach is ambiguous and cannot be settled from the
  repo/context, ask the maintainer — prefer a structured `AskUserQuestion` with concrete options over
  proceeding on a guess. A default may be chosen only for a genuinely reversible, low-stakes choice, and
  it is stated explicitly in the reply.
- **Plan is visible.** The plan and the decisions are surfaced per rule:response-format and the prelude
  convention (mem:response-prelude), so the maintainer can approve the direction before code exists.
- **One pass after the decision.** Once decided, implement fully in one pass (ADR-002) — the gate is
  *before* coding, not a licence to leave the implementation half-done.
