---
id: rule:knowledge-handover
title: Knowledge handover to agents — placed, enforced, proven
tldr: "Knowledge must reach the next agent: enforce new mechanisms in the gate, place them where that agent loads them, and prove reachability (context-for.mjs)."
scope: governance
load: core
triggers:
  [handover, knowledge, onboarding, agent, mechanism, policy, discoverable, reachable, brief]
applies-to: [".claude/rules/**", "docs/adr/**", "scripts/**", "CLAUDE.md"]
---

# Knowledge handover to agents (ADR-006, ADR-022, ADR-003)

Every mechanism you introduce or change will be met by an agent who was not in this session — in this
repo, in a project downstream, after a compact. That agent must understand **what the situation is and
how to behave**, without being told by a human. Writing the knowledge down is not the deliverable; the
knowledge *arriving* is. A rule in a file nobody loads is a comment, not governance.

**A change is not done until its knowledge is handed over — placed, enforced and proven.**

## 1. Enforce it, don't merely document it

Order of preference, strongest first. Use the strongest one the change allows:

1. **The gate refuses the wrong thing** (`check:all`) — the agent cannot get it wrong, and learns the
   rule from the failure. A guard is worth more than a paragraph.
2. **The error message teaches in-band** — when a gate fires, it names the real options and the exact
   next step. Never advertise a mechanism that does not exist (that is a defect, ADR-032).
3. **The code says it where it is edited** — a header comment in the file the agent will open.
4. **Governance docs** — a rule/ADR, placed per §2.

Prose is the weakest form. If it can be checked, check it.

## 2. Place it where the agent actually loads it

Loading is selective (ADR-006). Ask: *which agent, on which task, with which keywords?* — and put the
knowledge in a document that agent loads:

- **Everyone, every task** → `CLAUDE.md` or a `load: core` rule.
- **A task touching X** → a `conditional` rule/ADR whose `triggers`/`applies-to` actually match X's
  vocabulary — the words the *tool* prints and the agent types, **not** the vocabulary of the person
  writing the rule.
- Rule of thumb: the agent staring at a red dead-code check searches for that tool's name, not for "rule
  maintenance". Put it where they will be, not where it feels tidy.
- A `conditional` document with no `triggers` and no `applies-to` is unreachable — `governance:check`
  rejects it.
- **Pick the layer, too** (ADR-033): knowledge every project needs goes in the core; knowledge only this
  stack needs goes in its own layer. Putting a stack mechanism in the core is not "extra safety" — it
  makes the core unusable for the next project, and the gate rejects it.

## 3. Prove it — reachability is verified, never assumed (ADR-004)

Before declaring done, **run the lookup the future agent would run** and show the result:

```bash
node scripts/context-for.mjs "<the words that agent would use>" <the files they would touch>
```

The new rule/ADR must appear in that output. If it does not, the handover failed — fix the placement
or the triggers, not the wording. Where a gate enforces the rule, also show the gate rejecting the
wrong thing. State the evidence in the reply (rule:verification).

## 4. Brief every subagent you spawn (ADR-022)

A subagent inherits nothing automatically. Either tell it to read `CLAUDE.md` + the docs
`context-for.mjs` lists for its task, or pass the concrete constraints inline. Code-writing subagents
get the full in-scope rules. You are responsible for what the agents you spawn do not know.

## 5. Durable, not conversational

A chat message, a PR comment or a hand-off note is **not** a handover: it does not survive the session.
Knowledge lives in the repo (ADR-003) — rule, ADR, gate, error message, code comment. Anything a
downstream project's agent must know goes into a **published layer**, so `governance:update` carries it
to every consumer; anything only this project must know goes into the project line.

**A change a consumer must *act* on ships a briefing** in `docs/migrations/NNN-<slug>.md` (governed,
delivered by `governance:update`, which prints the briefings it changed — the one moment an agent is
certainly looking). Write it for the agent who will meet the change, not for a changelog reader: what
changed, what to do, what is now forbidden, with the exact commands and file names. A change nobody has
to act on belongs in `CHANGELOG.md` only.
