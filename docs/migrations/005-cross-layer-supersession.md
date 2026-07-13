# 005 — You can now decline an upstream decision (ADR-CORE-035)

Audience: the agent working in any project that consumes this core.
Layer: **core** (delivered by `governance:update`).

## What was broken

There was **no legal way** to say "this upstream decision does not apply to me" — the one thing layers
exist to permit. Both routes were closed:

- **Supersede** demanded an edit to the **old** file (`status: superseded` + `superseded-by`). If it
  belongs to an upstream layer it is hash-pinned and read-only: the drift-gate refuses. The documented
  procedure was not executable across a layer boundary.
- **Opt out** silently moved the file to the `project` layer, which produced two red builds:
  an opted-out `docs/adr/app-020-….md` claims layer `app` in its id while the gate computed `project`;
  and an opted-out `.claude/rules/theming.md` counted as `project`, so the pinned app rule that **cites**
  it "depended on a higher layer".

So opt-out was unusable for **every** ADR and for **every** upstream document another upstream document
cites.

## What you can do now

**Declare the supersession in your OWN document. Never touch theirs.**

```yaml
# .claude/rules/project/design-system.md   (your project layer)
---
id: rule:design-system
title: The design system for this project
tldr: "…"
scope: frontend
load: conditional
triggers: [ui, theme, color, style]
supersedes: [rule:theming] # ← the app-layer rule is retired. Its file is never edited.
---
```

The same works for ADRs and memory:

```yaml
# docs/adr/project/proj-140-flat-design-system.md
id: ADR-PROJ-140
supersedes: [ADR-APP-020] # the HUD design ADR does not apply here
```

**What happens then:**

- `docs/adr/README.md` and `manifest.json` show the old ADR as **`superseded by ADR-PROJ-140`**.
- `docs/adr/current/README.md` drops it from the accepted snapshot.
- `.claude/rules/INDEX.md` marks the retired rule **"SUPERSEDED — do not load this rule"**.
- **`context-for.mjs` stops listing it** and names the replacement instead. This is the part that matters:
  an index note nobody reads changes nothing; the agent must not be handed the retired document at all.
- The superseded file itself is **untouched**, still pinned, still updated by `governance:update`.

## Direction — the one hard rule

A **higher** layer may retire a lower one's decision. Never the reverse.

| | |
| --- | --- |
| project supersedes app / core | ✅ |
| app supersedes core | ✅ |
| same layer supersedes same layer | ✅ (unchanged) |
| **app supersedes project** | ❌ rejected |
| **core supersedes app** | ❌ rejected |

The reverse is not a style violation, it is a category error: a core ADR retiring an app ADR would mean
the portable core had an opinion about a stack it must not know exists.

## What you must do

**Nothing, unless you were working around this.** If you wrote a parallel rule whose first paragraph says
"the pinned rule does not apply here" — the workaround this replaces — do it properly now:

1. Add `supersedes: [<the upstream id>]` to that rule's front-matter.
2. Delete the paragraph explaining that the other rule does not count. The index and `context-for.mjs`
   say it now, to every agent, without anyone having to read your prose.
3. If you opted the upstream document out to get around this, **remove it from
   `governance/opt-out.json`** — you no longer need to own the file to decline the decision, and owning it
   means you stop receiving its upstream fixes.
4. `npm run governance:sync && npm run check:all`.

## Also fixed

**An opt-out no longer changes a document's layer.** It changes who owns the *file* (ADR-CORE-032); it
never meant the decision came from somewhere else. `layerOfPath()` now reads `optedOut[]` as well as
`files[]`, so an opted-out app ADR is still an app ADR — and the two red builds above are gone.

## What is now forbidden

- **Editing an upstream file to mark it superseded.** It never worked; now there is no reason to try.
- **Declaring `supersedes` toward a higher layer.** Rejected by the gate, with the direction named.
- **Two documents claiming to have superseded the same one**, or an old file whose `superseded-by`
  disagrees with the superseding document. Two answers to "who replaced this" is how a generated index
  quietly starts lying.
