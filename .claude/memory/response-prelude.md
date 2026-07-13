---
id: mem:response-prelude
title: "Show plan + loaded governance before each task"
tldr: "Open non-trivial tasks with a short prelude — what I'll do + which ADRs/rules/memory I'm consulting — so the governance footprint is auditable per-step."
scope: governance
load: core
type: feedback
---

Before kicking off a non-trivial task (anything that touches code, runs commands, or makes a
governance-relevant decision), open with a short prelude block:

```
**Plan:** <one or two sentences on the action>
**Kontext:** <ADRs/rules/memory I just consulted or am leaning on for this step>
```

Trivial single-step lookups don't need the prelude — a one-line intent suffices, per the
system-prompt rule "Before your first tool call, state in one sentence what you're about to do".
The prelude is for work that warrants accountability: any new ADR/rule load, any cross-cutting
change, any commit/release/build, or anything where the maintainer should be able to audit my
governance footprint without grepping the tool transcript.

**Why:** the maintainer asked how they can tell from the outside that I'm honouring the rules
and which extra context I'm pulling in. Tool-call logs technically show it, but a leading
prelude makes the footprint visible per-step without having to read every Read/Grep call.

**How to apply:**

- One short prelude per task. Don't repeat it for every tool inside the same task.
- Cite ADRs/rules/memory by name, not by path. Example: "ADR-CORE-024 + rule:versioning".
- If I pull in nothing new (the loaded `core` set is enough), say so: `Kontext: core set`.
- Use `path:line` references for code anchors as required by rule:response-format.
- Skip the prelude for one-line clarifying questions or for purely conversational replies.

Related: [[mem:user-conventions]] · rule:response-format · rule:context-loading.
