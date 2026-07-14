---
id: ADR-CORE-038
title: The layer is part of the briefing filename — <layer>-NNN-<slug>.md, not a number range
status: accepted
tldr: "Briefings are named <layer>-NNN-<slug>.md (core-001-…, app-001-…); number ranges were unchecked prose, and a collision aborts a consumer's governance:update."
scope: governance
load: conditional
triggers:
  [
    migration,
    briefing,
    migrations,
    filename,
    name,
    numbering,
    number,
    range,
    block,
    prefix,
    layer,
    collision,
    rename,
    handover,
  ]
applies-to:
  ["docs/migrations/**", "scripts/check-index.mjs", "scripts/lib/governance.mjs", ".claude/rules/knowledge-handover.md"]
supersedes: []
superseded-by: null
---

## Context

Every layer publishes migration briefings (`rule:knowledge-handover`): one file per change a consumer must
**act** on, delivered by `governance:update`, which prints the ones it changed. Unlike an ADR or a rule, a
briefing has **no front-matter and no id** — deliberately: it is a letter to the next agent, not an indexed
document. Its **filename is therefore its identifier**, and the filename is what two layers can collide on.

They were kept apart by **number ranges**, stated in prose in `docs/migrations/README.md`: core `001–099`,
an app/stack layer `100–199`, a project `200+`. That guard was unsound in three separate ways.

**1. Nothing checked it.** `governedPaths()` collects `docs/migrations/*.md` by extension, with no name
pattern; `check-index.mjs` did not look at the directory at all. The range lived exclusively in a README —
a file no agent is required to load, and which `context-for.mjs` never hands anyone.

**2. The collision does not wait for the 100th briefing.** The failure mode is not "core runs out of
numbers". An agent in the app layer sees a `docs/migrations/` that ends at `007-…` — the core briefings are
pinned into its repo, so they are right there — and picks `008-…` as the next free number. Nothing in its
context ever mentioned a range. The next core change then also ships `008-…`, and the two files are the
same path.

**3. It detonates in the worst possible place.** A collision is not caught where it is made. It surfaces
downstream, in `detectCollisions` (`scripts/lib/governance-core.mjs`), which **aborts the consumer's
`governance:update`** — so the repo that did nothing wrong can pull *nothing at all* until a file that is
already published in someone else's layer is renamed.

This is, line for line, the argument ADR-CORE-034 made about number blocks for ADR ids: the blocks were
already violated, a block is a convention rather than a property, and the layer stayed invisible exactly
where it mattered. The README even conceded the point in writing — *"if that ever chafes, give them a layer
prefix too."* It chafes.

## Decision

**The layer is part of the briefing filename:** `<layer>-NNN-<slug>.md`.

```
docs/migrations/core-001-config-layering.md      the agnostic core   (althing)
docs/migrations/app-001-hud-primitives.md        the desktop shell   (saga-rust-template)
docs/migrations/proj-001-…                       a project's own     (never published)
```

- The prefix is the layer id, lowercased, exactly as ADR **files** are named (`core-004-…md`,
  `proj-105-…md`, ADR-CORE-034). The project layer — the one that is never published — uses `proj`.
- **Numbers are kept, not reissued.** `001-config-layering.md` became `core-001-config-layering.md`. The
  mapping is 1:1, so every reference in git history and in a released CHANGELOG stays decodable.
- Each layer numbers **independently and without bound**. There are no ranges to allocate, no coordination
  between layers, and no ceiling — the thing a range can never promise.
- A briefing keeps its plain shape: still no front-matter, still no id, still not in any index. This ADR
  changes the **name**, and nothing else about what a briefing is.

### The gate can now check what a range never could

`governance:check` reads the layer the filename **claims** and compares it against the layer the manifest
says actually **owns the file** (`layerOfPath`). A mismatch, or a name that claims no layer at all, is a red
build — with the corrected filename in the message. Anything not pinned is the project layer, so a
project's own briefing must be `proj-NNN-…`.

That check is the point of this ADR. A number is inert: it cannot contradict reality, so no gate can catch
it lying. A prefix is a claim, and a claim can be verified (`rule:knowledge-handover` §1 — the gate refuses
the wrong thing, and the agent learns the rule from the failure rather than from a README it never opened).

## Consequences

- The seven core briefings are renamed (`001-…` → `core-001-…`). For a consumer this is a rename delivered
  by `governance:update`: the old path is deleted, the new one written. Its own briefings, if it publishes
  any, must be renamed by hand — the gate names each one and prints the corrected filename.
- A briefing whose name carries no layer **fails `check:all`** from this version on. That is deliberate:
  the legacy shape is precisely the one that collides, and a warning nobody must fix does not get fixed.
- Cross-layer collision is now **structurally impossible** rather than conventionally unlikely: two layers
  cannot produce the same filename, whatever numbers they choose.
- `governance:update` still prints every changed briefing, so the renamed files land in front of the agent
  the moment they arrive.

## Alternatives considered

- **Gate the existing ranges** (core must be `001–099`, and so on). Cheaper — no rename — but it keeps the
  ceiling that prompted the question, and it re-introduces exactly what ADR-CORE-033/034 abolished:
  a fourth layer would need a block allocated to it, i.e. coordination between layers that are supposed to
  be independent. It also cannot be checked without hard-coding a range table into the core, which would
  make the core know how many layers exist above it.
- **Give briefings front-matter and an id** (`MIG-CORE-001`), like ADRs. It solves nothing here: the
  collision surface is the *path*, not the id, so the filename would have to carry the layer anyway. It
  would also turn a deliberately plain letter into an indexed document.

## References

- ADR-CORE-034 (the same argument, for ADR ids), ADR-CORE-033 (layers), ADR-CORE-030 (the pin).
- `rule:knowledge-handover` (what a briefing is and when one is written).
- Gate: `scripts/check-index.mjs` §6; name shape: `scripts/lib/governance.mjs` (`BRIEFING_NAME_RE`).
- Migration briefing: [`docs/migrations/core-008-layered-briefing-names.md`](../migrations/core-008-layered-briefing-names.md).
