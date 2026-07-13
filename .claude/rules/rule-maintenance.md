---
id: rule:rule-maintenance
title: Rule & ADR maintenance
tldr: "New policy -> a rule/ADR with full front-matter, in the right layer (never edit an upstream one); regenerate indexes; keep tldrs accurate and the gate green."
scope: governance
load: conditional
triggers: [rule, adr, maintenance, policy, index, layer, project-line, supersede]
applies-to: [".claude/rules/**", "docs/adr/**", "scripts/**"]
---

# Rule & ADR maintenance (ADR-CORE-007, ADR-CORE-033)

- New or changed policy → add/update the relevant `.claude/rules/*.md` or `docs/adr/<layer>-NNN-*.md` with
  complete front-matter (`id`/`title`/`tldr`/`scope`/`load`, plus `triggers`/`applies-to`).
- **An ADR id carries its layer** (ADR-CORE-034): `ADR-CORE-004`, `ADR-APP-026`, `ADR-PROJ-105`, and the
  filename matches (`core-004-…md`). Each layer numbers independently — there are no blocks to allocate.
  The gate compares the layer the id **claims** against the layer that actually **owns** the file, so a
  mislabelled ADR is a red build, not a misleading citation everyone trusts.
- **Put it in the right layer (ADR-CORE-033).** Governance is layered, and every layer above the lowest is
  **read-only** in the repo that consumes it:
  - Governance for **this project only** → the **project line**: `.claude/rules/project/*.md`,
    `docs/adr/project/proj-NNN-*.md`, id `ADR-PROJ-NNN`. Never pinned, never published, yours to change.
  - Governance for **the layer this repo owns** → the normal `.claude/rules/` / `docs/adr/` files. Pin it
    with `npm run governance:sync`; it is published to every consumer.
  - Governance an **upstream layer** owns → **do not edit it here.** Upstream the change (make it in the
    repo that owns the layer, release, then `governance:update`), or take the path out of the pin with an
    explicit opt-out (ADR-CORE-032). The drift-gate blocks the in-place edit and names both options.
- **A lower layer must never cite a higher one.** A core rule may not reference an app-layer ADR: a
  project that adopts the core alone would be handed a rule pointing at a document it does not have.
  `governance:check` rejects it. Keep the *policy* in the lower layer and put the stack-specific
  *mechanism* in a companion document in the higher one, which cites back down.
- **A project's own script goes in `scripts/project/`** (ADR-CORE-032) — never directly under `scripts/`,
  which is governed and pinned recursively: a future upstream script of the same name would overwrite it
  silently. `scripts/project/**` is never pinned, never touched by `governance:update`, and is a `knip`
  entry point.
- **Config follows the same layering (ADR-CORE-032).** Governed config is pinned and read-only in a consumer.
  Project lint/knip settings go into the **overlays** (`eslint.config.project.mjs`, `knip.project.json`,
  merged on top); build/TS config and `.prettierignore` are project-owned outright. Anything else a
  project must diverge on is taken out of the pin explicitly in `governance/opt-out.json` — and thereby
  stops receiving upstream updates for that file. Never edit a governed config in place, and never create
  a higher-priority config file that shadows it (the gate rejects that too).
- Keep `tldr` accurate and ≤160 chars — it is what an agent uses to decide whether to load the doc.
- After any change, run `npm run governance:sync` (regenerate indexes + re-pin the layer) and
  `npm run governance:check` (must be green).
- **Superseding — declared in the NEW document only** (ADR-CORE-035). The superseding document lists
  `supersedes: [<id>]` in its front-matter. **The superseded file is never touched.** The generated
  indexes mark it superseded, and `context-for.mjs` stops handing it to agents.

  ```yaml
  # .claude/rules/project/design-system.md
  id: rule:design-system
  supersedes: [rule:theming] # the app-layer rule is retired here; its file stays as published
  ```

  This is what lets a project **decline an upstream decision**: the old file belongs to a pinned layer and
  is read-only, so demanding an edit to it — as this rule used to — made supersession impossible across a
  layer boundary. Works for ADRs, rules and memory.

  **Direction:** a **higher** layer may retire a lower one's decision (project → app → core). Never the
  reverse — a core ADR retiring an app ADR would mean the portable core had an opinion about a stack it
  must not know exists. The gate rejects it.

  Never delete history: the retired document stays exactly where it is.
- **An opt-out is not a way to decline a decision.** It changes who owns a *file* (ADR-CORE-032), not
  which layer a *decision* came from — an opted-out app ADR is still an app ADR. To decline a decision,
  supersede it. Opt-out is the escape for **config**.
- **Wanting to change something an upstream layer owns?** Read rule:upstream-changes *first*. It asks the
  question that comes before "how do I get this through": **am I in the wrong layer?** — and it states
  what upstreaming actually costs (a commit per layer, and it is a proposal to the maintainer, not
  something you commit yourself).
