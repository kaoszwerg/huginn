---
id: rule:reusability
title: Reusability
tldr: "Before adding code, search for an existing util/component to reuse or extend; one source per cross-cutting concern; a justified second copy needs an ADR."
scope: global
load: conditional
triggers: [reuse, duplicate, component, shared, dry, ssot, copy]
applies-to: []
---

# Reusability (ADR-005)

- **Search before you write.** Before adding a function, component or module, look for an existing one to
  reuse or extend. A near-duplicate you did not find is still a duplicate.
- **One source per cross-cutting concern.** Names, taglines, palettes, shared types, shared helpers,
  shared state — each has exactly one home. Never inline a second copy "just here".
- **Generated contracts are never hand-redeclared.** Where a boundary type is generated from its source
  of truth, the other side imports it — it does not retype it (ADR-005, rule:code-quality).
- **Extend the shared thing, don't fork it.** If the shared primitive almost fits, improve it (with its
  tests) rather than copying it and diverging. Where the project has a design system, an interactive
  control is a primitive *from* it, never a bespoke one restyled per view (rule:core-principles §10).
- **A justified second copy requires an ADR.** Duplication is a decision with consequences, so it is
  recorded like one — not discovered later in a grep.

**Where the shared things live** (which directory holds the UI primitives, the utilities, the store) is a
project/stack decision, recorded in that layer. That there is exactly one of each is not.
