---
id: ADR-CORE-035
title: Cross-layer supersession — declared in the superseding document, never in the superseded one
status: accepted
tldr: "A project can retire an upstream decision by declaring `supersedes` in its OWN document; the pinned file is never touched. Direction: higher layer only."
scope: governance
load: conditional
triggers:
  [supersede, superseded, retire, decline, opt-out, override, layer, upstream, deviate, exception]
applies-to:
  ["docs/adr/**", ".claude/rules/**", "scripts/lib/governance.mjs", "scripts/check-index.mjs"]
supersedes: []
superseded-by: null
---

## Context

Layers exist so that a project can differ from what it consumes. It could not.

**There was no legal way to say "this upstream decision does not apply to me."** Both routes the
governance nominally offered were closed:

- **Supersede.** `rule:rule-maintenance` said: _"set the old one's `status: superseded` +
  `superseded-by`, the new one's `supersedes`."_ That demands an edit to the **old** file. If it belongs
  to an upstream layer it is hash-pinned and read-only — the drift-gate refuses. The documented procedure
  is simply not executable across a layer boundary.
- **Opt out.** Opting the file out moved it to the `project` layer, because `layerOf()` read the layer
  from `files[]` only and an opted-out path is not in `files[]`. Two red builds followed, both reproduced
  on a live consumer:
  - an opted-out `docs/adr/app-020-…md` claims layer `app` in its id while the gate computes `project`
    → the ADR-CORE-034 id/layer gate fails;
  - an opted-out `.claude/rules/theming.md` counts as `project`, so `rule:stack-tauri` (app, pinned),
    which **cites** it, suddenly "depends on a higher layer" → the acyclicity gate fails.

So opt-out was unusable for **every** ADR and for **every** upstream document that another upstream
document cites. ADR-CORE-032 and ADR-CORE-034 contradicted each other.

The cost was not theoretical. A consumer that does not use the HUD design system could not retire
`ADR-APP-020` or `rule:theming`: both stayed `accepted` in its index, describing a design the project does
not have. It worked around this with a **parallel** project rule carrying the same triggers, whose first
paragraph said "the pinned rule does not apply here". That works, and every further consumer would have
reinvented it — which is the definition of a missing mechanism.

## Decision

**Supersession is declared in the superseding document, and nowhere else.**

```yaml
# .claude/rules/project/design-system.md   (project layer)
id: rule:design-system
supersedes: [rule:theming] # ← the app-layer rule is retired. Its file is never touched.
```

- The **superseded file is never edited.** It stays exactly as its owning layer published it — pinned,
  hash-checked, updatable. Nothing about the drift-gate has to bend.
- The **generated indexes carry the result**: `docs/adr/manifest.json` and `docs/adr/README.md` show the
  ADR as `superseded by <id>`; `.claude/rules/INDEX.md` and `.claude/memory/MEMORY.md` mark the retired
  document **"do not load"**; `docs/adr/current/README.md` drops it from the accepted snapshot.
- **`context-for.mjs` refuses to list it.** This is the load-bearing part. An index note nobody reads
  changes nothing — the agent must not be handed the retired document in the first place, and instead be
  told which one replaced it.
- It works for **ADRs, rules and memory alike.** A project rule retiring an app rule is exactly the case
  that motivated this; ids are namespaced, so one mechanism serves all three.

### Direction is the invariant

**A higher layer may retire a lower layer's decision. Never the reverse.**

```
project  →  may supersede app, core        ✔
app      →  may supersede core             ✔
app      →  may supersede project          ✘   rejected
core     →  may supersede app              ✘   rejected
```

Same-layer supersession is unchanged and still normal (ADR-CORE-033 supersedes ADR-CORE-030).

The reverse direction is not a style violation, it is a category error: a core ADR retiring an app ADR
would mean the portable core held an opinion about a stack it must not know exists. `governance:check`
rejects it.

### An opt-out does not change a document's layer

The root cause of both red builds. Opting out changes **who owns the file** — the project keeps its edits
and stops receiving updates (ADR-CORE-032). It does not change **which layer the decision came from**.
`layerOfPath()` now reads `optedOut[]` as well as `files[]`, so an opted-out app ADR is still an app ADR.

With supersession available, a consumer rarely needs opt-out for a *document* at all: it declines the
decision instead of seizing the file. Opt-out remains what it always was — the escape for **config**.

## Alternatives

- **Let a consumer edit the pinned file after all** (a "local override" flag) — rejected: it destroys the
  one guarantee the drift-gate provides, and the next upstream update either clobbers the edit or is
  refused. Divergence must be *declared*, not smuggled into a file someone else owns.
- **Keep declaring supersession in the old document, and exempt the field from the hash** — rejected: a
  partial hash is not a hash. It also leaves the field unreachable in a *published* layer: the app layer
  could not retire a core ADR without editing althing's file either.
- **A separate `supersessions.json`** — rejected: a third place to keep in sync with two documents, and
  invisible where it matters (in the document that replaces the decision).

## Consequences

- `rule:rule-maintenance` changes: supersession is declared **only** in the new document. The old file is
  never touched — which is also simpler for the same-layer case that always worked.
- A `superseded-by` field left in an old document is still honoured for the same-layer case, but it must
  **agree** with what the superseding document declares; a disagreement is a red build, because two
  answers to "who replaced this" is how a generated index quietly starts lying.
- A project can now legitimately run without the app layer's design system, logging architecture or any
  other decision it declines — and say so in a file the maintainer reviews, instead of a paragraph in a
  parallel rule hoping the next agent reads it.

## References

- [ADR-CORE-032](core-032-config-layering-project-overlays.md) — opt-out (config), now explicitly *not* a
  layer change.
- [ADR-CORE-033](core-033-governance-layers-cascade.md) — the layers and the acyclicity gate whose false
  positives this removes. [ADR-CORE-034](core-034-layered-adr-identifiers.md) — the id/layer gate.
- Migration briefing: [`docs/migrations/core-005-cross-layer-supersession.md`](../migrations/core-005-cross-layer-supersession.md).
