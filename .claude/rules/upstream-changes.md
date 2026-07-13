---
id: rule:upstream-changes
title: When a change belongs upstream — and what that costs
tldr: "Before touching an upstream file, ask which layer the change is true in. Upstreaming is a proposal to the maintainer, and costs a commit per layer."
scope: governance
load: conditional
triggers:
  [
    drift,
    pinned,
    read-only,
    upstream,
    change,
    fix,
    edit,
    diverge,
    decline,
    contribute,
    cascade,
    althing,
    overlay,
    opt-out,
    supersede,
  ]
applies-to: ["governance/**", ".claude/rules/**", "docs/adr/**"]
---

# When a change belongs upstream (ADR-CORE-033, ADR-CORE-035)

You are here because a file you want to change belongs to a layer you consume: the drift-gate refused the
edit, or you are about to make one. **Do not start by asking how to get the edit through.**

## 1. Ask first: am I in the wrong layer?

**Nine times out of ten the change belongs in the project layer**, and you were about to push something
into every consumer that is only true here. Answer this before anything else:

| Is the change true …                                        | Then it belongs in …                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| for **every** project, whatever it is built from            | the **core** (`althing`)                                    |
| for every project on **this stack** (this framework, build) | the **app/stack layer** (the repo that publishes the shell) |
| **only here**                                                | your **project layer** — no upstream involvement at all     |

A rule that names a framework, a build tool or a design system is **not** portable, however true it feels.
Putting it in the core does not make the core stronger; it makes it unusable for the next project — and
the gate rejects it (ADR-CORE-033).

## 2. If the upstream decision is simply **wrong for you** — decline it, don't edit it

You do not need to own someone's file to disagree with it. Declare `supersedes` in **your own** document
(ADR-CORE-035):

```yaml
# .claude/rules/project/design-system.md
id: rule:design-system
supersedes: [rule:theming] # the app-layer rule is retired here; its file is never touched
```

The indexes mark it, `context-for.mjs` stops handing it to agents, and you keep receiving every other
upstream fix. **This — not opt-out — is how you decline a decision.** Opt-out seizes the *file* and costs
you its future fixes; it is the escape for **config**, not for a decision you disagree with.

## 3. If it really does belong upstream: it is a **proposal**, not an action

**You may not commit to the upstream repo.** It is a different repository, and branch/push authority is
the maintainer's alone (rule:git-workflow). Do not start it unasked in the middle of another task.

What you do instead:

- **State it, with evidence.** Which file, which layer, what is wrong, and why it is true for *every*
  consumer of that layer — not just for you. A reproduction beats an opinion (ADR-CORE-004).
- **Say what it costs** (below), so the maintainer can decide whether it is worth it now.
- **Leave the working tree green.** Do not leave a half-edited pinned file behind; `git checkout -- <path>`
  restores it.

## 4. Know the cascade cost before you propose it

A core change is **not** a quick fix. It is one repo per layer between the core and you — and the core is
usually the furthest away:

```
the core repo        change + test + green + commit + push
   ↓ governance:update
each layer between   pull + green + commit + push     ← it must survive the new core before you see it
   ↓ governance:update
your project         pull + green + commit + push
```

Every gate in between must stay green, and a change that a consumer must *act* on also needs a briefing in
`docs/migrations/` (rule:knowledge-handover). **If the change is not worth that, it belongs in a lower
layer.** That is not a discouragement — it is the honest price, and knowing it up front is what stops a
"small fix" from turning into an afternoon across every repository in the chain.

The hops are deliberate: each layer verifies a core change *before* the layer below it ever sees it.

## 5. The four legal ways to diverge, in the order you should consider them

1. **Put it in your project layer** — a new rule/ADR/script of your own. Nothing upstream involved. Try
   this first, and be honest about whether it really is only-here.
2. **Supersede** the upstream decision in your own document (ADR-CORE-035). For a *decision* you decline.
3. **Overlay** — where the upstream provides one (`eslint.config.project.mjs`, `knip.project.json`). For
   *config* you must extend (ADR-CORE-032).
4. **Opt out** (`governance/opt-out.json`) — the last resort, for config with no overlay. You take the file
   out of the pin, keep your edit, and **stop receiving every future upstream fix for it**. That cost is
   printed on every update, on purpose.

**Never** edit a file an upstream layer owns. The drift-gate blocks it, and if it did not, the next
`governance:update` would silently overwrite you or refuse to run.
