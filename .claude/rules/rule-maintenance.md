---
id: rule:rule-maintenance
title: Rule & ADR maintenance
tldr: "New policy -> a rule/ADR with full front-matter, in the right layer (never edit an upstream one); regenerate indexes; keep tldrs accurate and the gate green."
scope: governance
load: conditional
triggers: [rule, adr, maintenance, policy, index, layer, project-line, supersede]
applies-to: [".claude/rules/**", "docs/adr/**", "scripts/**"]
---

# Rule & ADR maintenance (ADR-007, ADR-033)

- New or changed policy → add/update the relevant `.claude/rules/*.md` or `docs/adr/NNN-*.md` with
  complete front-matter (`id`/`title`/`tldr`/`scope`/`load`, plus `triggers`/`applies-to`).
- **Put it in the right layer (ADR-033).** Governance is layered, and every layer above the lowest is
  **read-only** in the repo that consumes it:
  - Governance for **this project only** → the **project line**: `.claude/rules/project/*.md`,
    `docs/adr/project/NNN-*.md` (numbers from 100). Never pinned, never published, yours to change.
  - Governance for **the layer this repo owns** → the normal `.claude/rules/` / `docs/adr/` files. Pin it
    with `npm run governance:sync`; it is published to every consumer.
  - Governance an **upstream layer** owns → **do not edit it here.** Upstream the change (make it in the
    repo that owns the layer, release, then `governance:update`), or take the path out of the pin with an
    explicit opt-out (ADR-032). The drift-gate blocks the in-place edit and names both options.
- **A lower layer must never cite a higher one.** A core rule may not reference an app-layer ADR: a
  project that adopts the core alone would be handed a rule pointing at a document it does not have.
  `governance:check` rejects it. Keep the *policy* in the lower layer and put the stack-specific
  *mechanism* in a companion document in the higher one, which cites back down.
- **A project's own script goes in `scripts/project/`** (ADR-032) — never directly under `scripts/`,
  which is governed and pinned recursively: a future upstream script of the same name would overwrite it
  silently. `scripts/project/**` is never pinned, never touched by `governance:update`, and is a `knip`
  entry point.
- **Config follows the same layering (ADR-032).** Governed config is pinned and read-only in a consumer.
  Project lint/knip settings go into the **overlays** (`eslint.config.project.mjs`, `knip.project.json`,
  merged on top); build/TS config and `.prettierignore` are project-owned outright. Anything else a
  project must diverge on is taken out of the pin explicitly in `governance/opt-out.json` — and thereby
  stops receiving upstream updates for that file. Never edit a governed config in place, and never create
  a higher-priority config file that shadows it (the gate rejects that too).
- Keep `tldr` accurate and ≤160 chars — it is what an agent uses to decide whether to load the doc.
- After any change, run `npm run governance:sync` (regenerate indexes + re-pin the layer) and
  `npm run governance:check` (must be green).
- **Superseding an ADR:** set the old one's `status: superseded` + `superseded-by`, and the new one's
  `supersedes`. Never delete history.
