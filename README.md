# althing

**The portable agent-governance core.** Stack-agnostic rules, ADRs and memory for AI coding agents, plus
the tooling that indexes, pins, gates and distributes them — maintained once, synced into every project.

> _Þing_ — the Norse assembly that set the law. The **Althing** was the highest of them: where the rules
> were decided, and from where they travelled outward.

## What this is

An agent working in a repo needs to know how to behave: what "done" means, what may never be guessed,
what must be tested, how a decision is recorded, what it may not silently remove. That knowledge is
governance, and keeping a separate copy of it in every project means keeping N diverging copies.

althing holds **one** copy — the half that is true for _any_ project:

- **Rules** (`.claude/rules/`) — the operating contract: verify first, fix don't remove, one pass, log
  everything, test first, hand the knowledge over.
- **ADRs** (`docs/adr/`) — the decisions behind them, with their alternatives and consequences.
- **The gate** (`scripts/`) — generated indexes with a staleness hash (ADR-007), front-matter and
  reachability validation, and a layered content-hash pin with a drift gate (ADR-033).

It holds **no** stack knowledge. No framework, no build tool, no design system. That is not an omission —
it is the whole point, and `governance:check` enforces it.

## Layers (ADR-033)

Governance is a stack of ordered layers. Each is owned by exactly one repo and published downstream:

```
althing                     owns 'core'   — agnostic; no upstream
  └── saga-rust-template    owns 'app'    — the Tauri 2 + Rust + React desktop shell
        └── ivaldi          owns nothing  — a leaf project
```

A repo **consumes** the layers of its upstream (read-only here — an in-place edit is drift), **may own**
one layer of its own, and **publishes the union** to its consumers. `ivaldi` therefore receives the
agnostic core _and_ the desktop shell in one update, and never talks to althing directly.

A **lower layer may never cite a higher one.** A core rule that referenced a HUD design ADR would hand a
dangling reference to every project that adopts the core alone — so the gate rejects it. The core stays
portable because it is checked, not because everyone remembered.

## Starting a new project from it

Create the repo from this one (GitHub → **Use this template**), then **immediately**:

```bash
npm install
npm run governance:init -- --from kaoszwerg/althing
```

`governance:init` is not a convenience — it closes a trap. A fresh copy inherits this repo's
`governance/config.json`, which says `"upstream": null`: *"I am the root of the cascade, I own everything
I ship."* That is a perfectly valid state, so the drift-gate stays **green** while your copy quietly owns
a private fork of the core and never receives another update. Nothing would ever tell you. `init` rewrites
the config, re-attributes every governed file to the layer that really owns it, and pins it — deleting
nothing.

Then do the three things it prints: rewrite `.claude/memory/project-scope.md` (it still describes
*althing*, and every agent reads it at boot), reset the version and changelog, and get `check:all` green.

A repo that will **publish a layer of its own** downstream passes `--layer <name>`; a leaf project — the
usual case — passes nothing.

## Living with it

```bash
npm run governance:update   # pull the upstream's improvements in
npm run governance:check    # front-matter, index freshness, links, layer boundaries, drift
```

The drift-gate makes silent divergence impossible. Diverging from a governed file is still possible —
through a project overlay, by upstreaming the change, or with an explicit, visible opt-out (ADR-032) —
but never by quietly editing it in place.

## Working in this repo

Read [`CLAUDE.md`](CLAUDE.md) first, then the indexes it names. Every change here reaches every project
downstream, so:

- A change a consumer must **act** on ships a briefing in [`docs/migrations/`](docs/migrations/README.md).
  `governance:update` prints it — the one moment an agent is certainly looking.
- The gate must be green (`npm run check:all`) before anything lands.
