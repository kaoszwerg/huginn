---
id: ADR-CORE-034
title: The layer is part of the ADR id — ADR-<LAYER>-<NNN>, not a number block
status: accepted
tldr: "ADR ids carry their layer (ADR-CORE-004, ADR-APP-026, ADR-PROJ-105); number blocks were a convention nobody could enforce, and were already violated."
scope: governance
load: conditional
triggers: [adr, id, identifier, numbering, prefix, layer, block, rename, collision]
applies-to: ["docs/adr/**", "scripts/lib/governance.mjs", "scripts/check-index.mjs"]
supersedes: []
superseded-by: null
---

## Context

ADR-CORE-033 made governance a stack of layers, and every layer publishes its own ADRs. That immediately
raised a question the old scheme could not answer: **given `ADR-026`, which layer owns it?**

The first answer was **number blocks** — core `001–099`, project `100–199`, an app layer `200+`. It was
wrong on arrival, and provably so:

- **The blocks were already violated.** The app layer historically owns `001`, `020`, `021`, `023`, `025`,
  `026` and `031` — every one of them inside the core's block. Grandfathering them means the block rule is
  false the day it is written.
- **A block is a convention, not a property.** Nothing stops an agent in `althing` — which cannot see the
  app layer's ADRs at all — from picking `001` as "the next free number". The collision gate would catch
  it, but only downstream, in `saga-rust-template`, and the fix would then be to renumber an ADR that is
  already published to every consumer.
- **The layer stayed invisible where it mattered most.** `rule:core-principles` citing `ADR-026` reads as
  perfectly ordinary prose. It is in fact a layer violation — the core reaching up into the app layer —
  and nothing in the identifier says so. You had to know, or look it up.

## Decision

**The layer is part of the identifier:** `ADR-<LAYER>-<NNN>`.

```
ADR-CORE-004    the agnostic core   (althing)
ADR-APP-026     the desktop shell   (saga-rust-template)
ADR-PROJ-105    a project's own     (never published)
```

- The prefix is the layer id, uppercased; the project layer — the one that is never published — uses
  `PROJ`.
- **Numbers are kept, not reissued.** `ADR-026` became `ADR-APP-026`, not `ADR-APP-001`. The mapping is
  1:1, so every reference in the immutable git history stays decodable by a human. Renumbering would have
  bought nothing and destroyed that.
- Each layer numbers **independently** from here on: the next core ADR is `ADR-CORE-035`, the next app one
  `ADR-APP-032`, the next project one continues that project's own sequence. There are no blocks to
  allocate, and no coordination between layers.
- The filename carries it too (`core-004-…md`, `app-026-…md`), so the layer is visible in a directory
  listing and in every path `context-for.mjs` prints. ADRs are identified by their **id**, never by a
  filename pattern (the loader was matching `NNN-` and would simply have stopped seeing them).

### The gate can now check something it never could

`governance:check` compares the layer an ADR **claims** in its id against the layer the manifest says
actually **owns the file**. A mismatch is a red build, with the corrected id in the message.

That check is the real reason for this ADR. A number is inert — it cannot disagree with reality. A prefix
can, and so it can be verified. The same goes for the acyclicity gate: a citation of `ADR-APP-026` inside
a core document is now wrong *on its face*, before any lookup.

## Alternatives

- **Number blocks with a forward-allocation rule** (core `040–099`, app `200+`, project `100–199`) —
  rejected. It is the cheapest option and it does work, but it leaves the layer unreadable in the id, keeps
  the historical violation as a permanent exception list, and cannot be machine-checked in the one place it
  matters: the citation. It trades a real invariant for a saved afternoon.
- **Prefixes for new ADRs only, grandfathering the numeric ones** — rejected: two schemes forever. Every
  agent and every gate would have to understand both, and the half of the corpus that is most cited would
  remain layer-blind. It pays the cost of the change without collecting the benefit.
- **A `layer:` field in the front-matter instead of the id** — rejected: it does not appear in a citation.
  `ADR-026` in a sentence would still say nothing, which is exactly the failure being fixed.

## Consequences

- **A one-time rename across the cascade:** 55 ADRs and ~1400 citations in `althing`,
  `saga-rust-template` and `ivaldi`. The dead-citation check made this safe rather than brave — it matches
  the legacy `ADR-NNN` form too, so every missed reference fails the build instead of rotting quietly.
- **Commit messages and PR descriptions in the git history still say `ADR-026`.** They are immutable, and
  they stay readable: the number is unchanged, only prefixed. That was the deciding reason to keep the
  numbers.
- **The ADR index gains a Layer column**, read straight off the id — not a second fact that could drift.
- Adding a layer (a pack in `althing`, a new stack template) now needs no number negotiation at all: it
  picks a prefix and starts at `001`.

## References

- [ADR-CORE-033](core-033-governance-layers-cascade.md) — the layers themselves, and the acyclicity gate
  this identifier makes legible.
- [ADR-CORE-007](core-007-generated-indexes-staleness-gate.md) — the generated indexes that now carry the
  Layer column.
- `.claude/rules/rule-maintenance.md`, `docs/migrations/core-004-layered-adr-ids.md`.
