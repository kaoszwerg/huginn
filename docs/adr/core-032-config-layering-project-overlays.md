---
id: ADR-CORE-032
title: Config layering — pinned core config, project overlays, explicit opt-out
status: accepted
tldr: "Core config stays pinned; project-specific config is project-owned; eslint/knip take a project overlay; governance/opt-out.json opts a core path out of the pin."
scope: governance
load: conditional
triggers:
  [config, eslint, knip, tsconfig, vite, prettier, deny, drift, opt-out, overlay, fork, pinning]
applies-to:
  [
    "scripts/lib/governance-core.mjs",
    "scripts/governance-manifest.mjs",
    "scripts/governance-update.mjs",
    "eslint.config.mjs",
    "knip.config.js",
    "governance/**",
  ]
supersedes: []
superseded-by: null
---

## Context

ADR-CORE-030 pins the portable governance core and gates drift. In practice the gate fired on work a
project is *supposed* to do: the pinned set included `knip.json`, `tsconfig*.json`, `vite.config.ts`
and `.prettierignore` — files that describe **this** project's module graph, build and paths, not the
template's governance. The concrete trip-wire: a fork's generated `src/bindings/**` has no consumer
yet, knip reports the files as unused, and the only fix — `{"ignore": [...]}` in `knip.json` — drifts a
core file and turns `check:all` red. The developer could not configure their own quality gate.

Two further problems made this worse:

- **The drift message promised an escape that did not exist.** It told forks to "opt the path out",
  but no opt-out was implemented. The only real path was upstreaming — for a project-specific setting
  that does not belong in the template at all.
- **The governance contradicted itself.** `rule:dependencies` explicitly allows the maintainer a
  "recorded, time-boxed exception" for a security advisory; that exception lives in
  `src-tauri/deny.toml`'s `[advisories] ignore`, and a new dependency licence lives in
  `[licenses] allow` — both pinned, so both were drift.

Unpinning the offenders wholesale is not an option either: a lint config typically carries governance
gates (secret detection, the security rules, and on a stack with a design system, the ban on native UI
defaults) *alongside* project-specific settings. It is a **hybrid** — governance *and* project
configuration in one file.

## Decision

Classify every config file, and give each class a mechanism:

- **Portable core (pinned).** Files that encode governance or a gate every project inherits unchanged:
  `CLAUDE.md`, `.husky/*`, `commitlint.config.js`, `.secretlintrc.json`, `.lintstagedrc.json`,
  `.editorconfig`, `.gitattributes`, `.prettierrc.json`, `src-tauri/deny.toml`, and the two hybrids
  below. Unchanged from ADR-CORE-030: in-place edits in a fork are fatal.
- **Project-owned (never pinned).** Config that necessarily describes the project's own shape:
  `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `.prettierignore`, `knip.project.json`.
  The template seeds them; from then on the project owns them and `governance:update` never touches
  them. The trade-off is accepted: template improvements to these files do not propagate.
- **`scripts/project/` is reserved for the project's own tooling.** `scripts/` is template-owned and
  pinned recursively — so a project script placed there survives only by accident, and a future template
  script of the same name overwrites it silently. `scripts/project/**` is excluded from the core, is
  never touched by an update, and is a `knip` entry point so it is not flagged as dead code. (Found in
  the first real fork: a project had put its own script directly under `scripts/`.)
- **Hybrid → project overlay.** The core file stays pinned and loads an optional, project-owned
  overlay:
  - `eslint.config.mjs` (core) appends `eslint.config.project.mjs` **after** the core config. ESLint
    imports the config file dynamically, so the core resolves the overlay with a top-level `await`.
  - `knip.config.js` (core) merges `knip.project.json`. knip has no `extends` and resolves `knip.json`
    *before* a JS config, so the JSON form is gone and the overlay carries a different name. The merge
    is **additive**: arrays are unioned, nested objects merge key-wise, other values from the overlay
    win — a project extends the core's coverage rather than silently shrinking it.
- **`CLAUDE.md` stays portable.** It is pinned, so it must not carry project state. The agent contract
  (principles, rule packs, commands, boundary conventions) is template-wide; what **this** project is —
  purpose, what exists, what deliberately does not — lives in `.claude/memory/project-scope.md`, which
  is project-owned, `load: core` and therefore read at boot. Without this split every fork would have to
  edit a pinned file just to describe itself, and opting the file out would cost it every future
  improvement to the governance entry point.
- **Shadowing is drift too.** A pinned core config can be bypassed without touching its hash: knip
  resolves `knip.json` *before* `knip.config.js`, ESLint resolves `eslint.config.js` before
  `eslint.config.mjs`. Creating one of those replaces the core config silently — the hash still matches.
  `governance:check` therefore rejects any file that would shadow a pinned core config and points at
  the overlay instead. Without this, the ban on editing core config is unenforceable by construction.
- **Explicit opt-out (the general escape).** `governance/opt-out.json` — `{"paths": ["<core path>"]}` —
  takes a core path out of the pin. Project-owned, hand-written, never generated. The drift-gate skips
  those paths, `governance:update` neither overwrites nor deletes nor re-pins them, and every run
  **prints** what is opted out. It is validated: a path must really be part of the core, and only a
  fork may use it (the template owns its core; `upstream: null` + a non-empty opt-out is an error).
  This is the mechanism for `deny.toml` exceptions, CI-workflow tweaks and anything unforeseen.

  **An opt-out is about a FILE, not about a LAYER (ADR-CORE-035).** It changes who owns the file — you
  keep your edits, updates stop. It does **not** move the document into your layer: an opted-out app ADR
  is still an app ADR, and reading it as `project` (which the gate did) made opt-out unusable for every
  document that carries a layer. **To decline a *decision*, supersede it** (ADR-CORE-035) — you do not
  need to seize someone else's file to disagree with it. Opt-out is the escape for **config**.
- **The drift message names only these three options** — overlay, upstream, opt-out — plus how to
  restore a pinned file. A message that advertises a mechanism nobody implemented is a defect.

The governance policy itself moves into `scripts/lib/governance-core.mjs` as pure, root-parameterised
functions, with `governance-manifest.mjs` / `governance-update.mjs` as thin CLIs. The gate that guards
every commit is now covered by tests against a temp repo (rule:testing).

## Alternatives

- **Remove all project-ish config from the pinned set** (no overlay) — rejected: it would unpin the lint
  config and hand the governance gates inside it to every consumer to weaken silently.
- **Keep everything pinned, add only the opt-out** — rejected as the sole fix: routine work (one knip
  ignore) would cost a whole-file opt-out and lose all template updates for that file.
- **`knip` key in `package.json` as the overlay** — rejected: knip reads it only when no config file
  exists, and a core `knip.config.js` must exist.

## Consequences

- **Unpinning is not deleting.** When a path leaves the core but the template still ships it (exactly
  what this ADR does to `tsconfig*`/`vite.config.ts`/`.prettierignore`), `governance:update` *releases*
  it to the project layer: the project keeps its own file, edits and all, and simply owns it from now
  on. Only a path the template actually deleted is deleted downstream. Without this distinction the
  first update after this ADR would have destroyed every fork's build/TS config.
- A fork configures its own lint/knip/build/TS without touching the core; `check:all` stays green.
- An opted-out path stops receiving template fixes — that cost is explicit, printed on every update,
  and recorded in a file the maintainer reviews. Divergence is visible, never silent.
- An overlay can also relax a core rule (e.g. switch a lint rule off). That is deliberate: the core is
  a governance contract, not a sandbox — and the change lives in a project-owned file, in the diff,
  instead of hidden inside a template-owned one.

## References

- Migration briefing for projects: [`docs/migrations/core-001-config-layering.md`](../migrations/core-001-config-layering.md)
  (pinned core, printed by `governance:update`).
- ADR-CORE-033 (layered governance — "core" here reads as "any upstream-owned layer"), ADR-CORE-030 (superseded),
  ADR-CORE-007 (hash gate), ADR-CORE-009/ADR-CORE-011 (dependency + security exceptions),
  `.claude/rules/rule-maintenance.md`, `.claude/rules/dependencies.md`.
