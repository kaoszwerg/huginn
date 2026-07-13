---
id: ADR-033
title: Governance layers — an agnostic core, an application layer, and a publishing cascade
status: accepted
tldr: "Governance is N ordered layers (core → app → project); a repo consumes upstream layers, may own one, and republishes the union to its own forks."
scope: governance
load: conditional
triggers:
  [
    layer,
    layers,
    core,
    app,
    althing,
    cascade,
    upstream,
    publisher,
    consumer,
    fork,
    template,
    governance-update,
    drift,
    manifest,
    portable,
  ]
applies-to:
  [
    "governance/**",
    "scripts/lib/governance-core.mjs",
    "scripts/governance-manifest.mjs",
    "scripts/governance-update.mjs",
    "scripts/check-index.mjs",
  ]
supersedes: [ADR-030]
superseded-by: null
---

## Context

ADR-030 gave the governance exactly **two** layers: a template-owned *core* (hash-pinned, read-only in
a fork) and a *project* layer (never touched). That model assumed one template and N leaf projects, and
it conflated two axes that are in fact independent:

- **Ownership** — who may change a file (template vs project). ADR-030 handles this.
- **Portability** — is a rule true for *any* project, or only for a Tauri/Rust/React/HUD desktop app?

The conflation is provable, not theoretical: `.claude/memory/glossary.md` and
`.claude/memory/logging-contract.md` are pinned as "core" and are 100 % stack vocabulary (HUD panels,
`Serialize for AppError`). `CLAUDE.md` — pinned, and therefore read-only in every fork — states "Tauri 2
desktop app" and prescribes `npm run gen:types`. Of the fourteen steps in `check:all`, exactly two
(`secrets`, `governance:check`) are stack-free. A project that is not a Tauri desktop app cannot adopt
this core without inheriting decisions that do not apply to it.

The requirement is to maintain the agent governance **once**, centrally, and distribute it to several
unrelated projects — without constraining what those projects are. That needs a portable core that owns
no stack decisions. But this repo cannot simply *become* that core: it has a live fork (`ivaldi`,
`governance/manifest.json` → `upstream: kaoszwerg/saga-rust-template`) that depends on it for exactly
the stack governance the core must shed — the Tauri shell, the HUD design system, the Rust conventions.

So one repo must be a **consumer** and a **publisher** at the same time. ADR-030's model cannot express
that: it derives the role from a single boolean (`isTemplate = manifest.upstream === null`), and a fork
is forbidden from pinning any file of its own.

## Decision

**Governance is a stack of ordered, named layers.** Each layer is owned by exactly one repo and
published to that repo's consumers.

- `core` — portable, stack-agnostic. Owned by **althing**. True for every project, whatever it is built
  from.
- `app` — the application layer. Owned by **saga-rust-template**: the Tauri 2 + Rust + React HUD desktop
  shell — its ADRs, rules, scripts, lint gates and CI.
- `project` — never pinned, never published, owned outright by each repo (`.claude/rules/project/`,
  `docs/adr/project/`, `scripts/project/`, `project-scope.md`, build/TS config per ADR-032).

The order is `core < app < project`. A repo:

- **consumes** every layer its upstream publishes (read-only here — an in-place edit is drift, exactly as
  in ADR-030),
- **may own** at most one layer of its own (`layer` in `governance/config.json`; a pure consumer owns
  none),
- **publishes** the union of what it consumed and what it owns to its own consumers.

This yields the cascade: `althing → saga-rust-template → ivaldi`. A core change reaches `ivaldi` in two
hops, and the middle repo reviews it before it propagates — that is a feature, not a cost: the app layer
is verified against the new core before any leaf sees it. **`ivaldi` never points at `althing`;** its
upstream stays `saga-rust-template`, which is the only repo that publishes the app layer.

### Layer membership is derived, never annotated

A file's layer is **not** written into the file. It is derived:

- a path listed in the **upstream manifest** belongs to the layer the upstream says it does — and is
  read-only here;
- a governed path **not** in the upstream manifest belongs to **this repo's own layer** — if this repo
  owns one. If it owns none (a leaf project), the path is simply not governed: it is project-owned.

Two consequences follow, and both are the point:

- **No file moves.** `scripts/`, `.claude/rules/`, `docs/adr/` keep their paths. Encoding the layer in
  the directory (`scripts/core/…`, `scripts/app/…`) was rejected: it would rewrite every path in the
  pinned set, and every consumer's project-owned `package.json` still names those paths
  (`node scripts/sync-index.mjs`). The split would silently break the gate of every fork it was meant to
  serve.
- **Adding a layer is not a schema migration.** A future `packs/` mechanism in althing (an opt-in
  `node-ts` or `python` layer) is the same machinery with another layer id.

### The manifest stays readable by the previous logic

`governance:update` **self-updates first**: a consumer runs its own, older copy of the update logic while
fetching the new one (ADR-030). It reads the upstream manifest with that old code *before* the new code
exists. If this ADR's schema broke that read, the very update that ships the fix would be the one that
fails.

Therefore the schema is **strictly additive**:

```jsonc
{
  "generated": true,
  "governanceVersion": "0.2.0", // version of the layer THIS repo publishes
  "upstream": "kaoszwerg/althing", // retained: the old logic reads this
  "layers": [
    // new
    { "id": "core", "source": "kaoszwerg/althing", "version": "0.1.0" },
    { "id": "app", "source": null, "version": "0.2.0" }
  ],
  "count": 120,
  "files": [{ "path": "…", "hash": "…", "layer": "core" }] // `layer` is new; path+hash unchanged
}
```

`files[]` remains one flat list of `{path, hash}`. The old `applyUpstream` iterates exactly that and
copies every entry — which is precisely correct for a leaf: it receives core **and** app as one set.
`layer` is ignored by the old code and honoured by the new. The old drift-gate keeps working too: a leaf
consumer never pins files of its own, so its behaviour is unchanged.

### `governance/config.json` — project-owned, optional

```jsonc
{
  "upstream": "kaoszwerg/althing", // null in althing
  "layer": "app", // null in a leaf project
  "owns": {
    "memory": ["glossary.md", "logging-contract.md"], // memory files this layer publishes
    "config": ["eslint.config.mjs", "knip.config.js", "src-tauri/deny.toml", ".github/workflows/ci.yml"]
  }
}
```

Rules, ADRs, migrations and `scripts/**` are discovered by scanning; **memory and config files are
declared**, because neither directory is exhaustively governed (a memory may be project state; a config
file may describe the project's own shape, ADR-032). Declaring them replaces the hardcoded
`CORE_MEMORY` / `CANDIDATE_CONFIG` lists, which are what pinned HUD vocabulary and `src-tauri/deny.toml`
into the "portable" core in the first place.

When the file is absent, the legacy behaviour is derived from the manifest: `upstream` from
`manifest.upstream`, and `layer = upstream ? null : "core"`. **`ivaldi` therefore needs no config file at
all** — it is a leaf, and the fallback describes it exactly.

`exclude` is what stops a repo from publishing its own infrastructure. A repo's CI workflow is scanned
like everything else, but it must not reach its consumers merely because it exists; althing's CI gates
althing, and has no business running in a Tauri project.

### Three gates, because a layer boundary that is not enforced is a comment

1. **Drift** (from ADR-030, unchanged): a file owned by an upstream layer must not be edited in place.
   Diverge via a project overlay, by upstreaming the change, or by an explicit opt-out
   (`governance/opt-out.json`, ADR-032).
2. **Collision**: no two layers may ship the same path, and no two layers may ship the same ADR id or
   rule id. Detected when a publisher pins its layer, so it can never reach a consumer.
3. **Acyclicity** — the load-bearing one. **A document in a lower layer must not reference a document in
   a higher one.** A core rule may not cite the app layer's HUD-primitives decision, nor its
   `tracing`-sinks decision. Both markdown links *and* bare `ADR-NNN` / `rule:<slug>` citations are
   checked, because a project that adopts only the core would otherwise inherit a rule pointing at a
   document it does not have. A higher layer citing a lower one is always allowed and is how the app
   layer concretises the core.

### Splitting a mixed document: the id stays, the body moves

Most core documents are mixed — an agnostic policy paragraph followed by concrete tooling. They are
also densely cross-referenced (ADR-002 is cited ~10×, ADR-004 ~9×, ADR-003/005/030/032 6–7× each, from
agnostic *and* stack documents alike). Renumbering or relocating any of them would leave dangling
citations on both sides of the split.

So: **a mixed document keeps its id and stays in the core, carrying only the agnostic policy.** Its
stack-specific half becomes a *companion* document in the app layer, with a new id (ADRs from 200), which
cites the core document. Never two files with the same id, never a moved id.

## Alternatives

- **Keep ADR-030's two layers and put the stack governance in each project's project line** — rejected:
  the Tauri/HUD rules would be a frozen copy in every desktop project, diverging immediately, and
  `ivaldi` would stop receiving shell improvements. That is the duplication ADR-005 exists to prevent.
- **Point `ivaldi` directly at althing and give it the app layer as opt-in packs** — rejected for now:
  it makes althing own the HUD design system, which is precisely the coupling this ADR removes. The
  layer machinery makes it a later option, not a lost one.
- **Encode the layer in the path (`scripts/core/`, `.claude/rules/app/`)** — rejected: see above; it
  breaks every consumer's project-owned script paths for a benefit the manifest already provides.
- **Publish althing as an npm package** — deferred, as in ADR-030: the git-pull needs no registry, and
  the self-updating updater already solves the bootstrap problem a package would.

## Consequences

- The core can be adopted by a project that is not a desktop app, in any language, as long as Node is
  available to run the governance scripts (that is the one assumption the core makes about a consumer).
- `saga-rust-template` gains a second role. It no longer owns `CLAUDE.md`, the agnostic rules or ADRs
  002–011/022/024/030/032 — it consumes them. It owns, pins and publishes the app layer, and its
  `check:all` must stay green against a core it does not control. When a core change breaks it, that is
  discovered here, before `ivaldi` ever sees it.
- `CLAUDE.md` becomes agnostic. The stack's quick facts and essential commands move to an app-layer rule
  loaded at boot (`load: core`), so an agent in `ivaldi` still meets them on the first read — the file it
  arrives in changes, the knowledge it receives does not (rule:knowledge-handover).
- Two hops mean a core fix reaches `ivaldi` only after `saga-rust-template` has adopted and released it.
  Accepted deliberately: an unreviewed core change reaching a live product unmediated is the worse
  failure.

## References

- Supersedes [ADR-030](030-portable-governance-core.md) (portable core, hash pin, drift gate,
  `governance:update`, self-update — all retained here, generalised from two layers to N).
- [ADR-032](032-config-layering-project-overlays.md) — which config is pinned, project-owned, overlayable
  or opted out. Unchanged, except that "core" now reads "any upstream-owned layer".
- [ADR-003](003-repo-single-source-of-truth.md) (repo SSOT), [ADR-005](005-reusability-policy.md) (one
  source, no structural duplication), [ADR-006](006-context-budget-selective-loading.md) (selective
  loading — a rule must be reachable in the project that receives it),
  [ADR-007](007-generated-indexes-staleness-gate.md) (generated indexes + hash gate).
- Migration briefing: [`docs/migrations/003-governance-layers.md`](../migrations/003-governance-layers.md).
