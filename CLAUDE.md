# Agent contract

> **READ FIRST.** Before any work, read this file, then the TLDR indexes
> (`docs/adr/manifest.json`, `.claude/rules/INDEX.md`, `.claude/memory/MEMORY.md`) and every
> ADR/rule/memory marked `load: core`. That set is **not fixed**: it includes
> `.claude/memory/project-scope.md` (what **this** project is) and every `load: core` rule the project's
> own layers contribute — the rules index tells you which. Load other ADRs/rules **on demand** by their
> `tldr`/`triggers`/`applies-to` (or via `node scripts/context-for.mjs "<keywords>" <files...>`). After a
> context compact/resume, re-read this file + the indexes.
> Full contract: `.claude/rules/context-loading.md` + ADR-CORE-006.

This file is the **portable core** (ADR-CORE-033): it holds what is true for every project the governance
governs, whatever it is built from. It therefore says nothing about a stack, a framework or a product.
What **this** project is, which language it speaks and which commands it runs live in the documents named
above — and they are read at boot, so nothing is lost by keeping this file free of them.

## Core principles (index — details behind each link)

1. Best solution, never the easiest; no shortcuts; one pass, no leftovers; **fix, don't remove** — a feature is removed only with the owner's consent. → [ADR-CORE-002](docs/adr/core-002-best-solution-principle.md)
2. Verify first, never guess; every claim provable. → [ADR-CORE-004](docs/adr/core-004-verify-first-no-guessing.md)
3. Repo is the single source of truth; memory is repo-resident. → [ADR-CORE-003](docs/adr/core-003-repo-single-source-of-truth.md)
4. Reuse over duplication; one source for shared types/theme/utilities. → [ADR-CORE-005](docs/adr/core-005-reusability-policy.md)
5. Selective context loading; reload after compact. → [ADR-CORE-006](docs/adr/core-006-context-budget-selective-loading.md)
6. Generated, hash-checked indexes; portable, layered governance. → [ADR-CORE-007](docs/adr/core-007-generated-indexes-staleness-gate.md) · [ADR-CORE-033](docs/adr/core-033-governance-layers-cascade.md)
7. Unified quality gate (`check:all`), pre-commit + CI. → [ADR-CORE-008](docs/adr/core-008-quality-pipeline.md)
8. Security by design; stable deps only; tests from the first module. → [ADR-CORE-011](docs/adr/core-011-security-by-design.md) · [ADR-CORE-009](docs/adr/core-009-dependency-policy.md) · [ADR-CORE-010](docs/adr/core-010-testing-strategy.md)
9. Log everything in every component; never log secrets; no silent failures — **including the one nobody caught**: every entry point has a last-resort handler, so a crash never leaves the user with nothing. → [rule:logging](.claude/rules/logging.md) · [rule:crash-handling](.claude/rules/crash-handling.md)
10. The UI is never a default: where a design system exists, every control the user touches belongs to it — nothing ships looking or behaving like a stock element, whatever it is built on. → [rule:core-principles](.claude/rules/core-principles.md)
11. Hand the knowledge over: enforce new mechanisms in the gate, place them where the next agent actually loads them, and **prove** it with `context-for.mjs`. → [rule:knowledge-handover](.claude/rules/knowledge-handover.md)
12. Challenge the premise, not just the task: agreement is a conclusion, never a default — object with evidence, never invent an objection, and once the maintainer has decided, execute. → [ADR-CORE-036](docs/adr/core-036-challenge-the-premise.md) · [rule:challenge-premises](.claude/rules/challenge-premises.md)

## Rule packs (`.claude/rules/`)

Always: `core-principles`, `response-format`, `context-loading`, `agent-delegation`,
`clarify-and-plan`, `challenge-premises`, `git-workflow`, `knowledge-handover` — plus every `load: core`
rule the project's own layers contribute. Load the rest by task scope: `no-guessing`, `verification`, `code-quality`,
`reusability`, `editing-workflow`, `rule-maintenance`, `logging`, `testing`, `documentation`, `security`,
`privacy`, `dependencies`, `automation`, `versioning`.
Index: [`.claude/rules/INDEX.md`](.claude/rules/INDEX.md).

## Governance layers (ADR-CORE-033)

Governance is a stack of ordered layers, each owned by exactly one repo and published downstream:

- **`core`** — this file, the agnostic rules and ADRs, the governance scripts. Portable; owns no stack
  decision. Hash-pinned and **read-only** in every repo that consumes it.
- **an app/stack layer** — optional, owned by the repo that publishes a shell (here: the Tauri desktop
  shell). Also pinned, also read-only in *its* consumers.
- **`project`** — yours, never pinned: `.claude/rules/project/`, `docs/adr/project/` (`ADR-PROJ-NNN`),
  `scripts/project/`, and the project-owned config (ADR-CORE-032).

**An ADR id names its layer** — `ADR-CORE-004`, `ADR-APP-026`, `ADR-PROJ-105` (ADR-CORE-034). A citation
therefore says, on its face, which layer it reaches into; the gate checks that the id agrees with the
layer that actually owns the file.

Add governance for **this** project to the project line — never edit a file an upstream layer owns; the
drift-gate blocks it and names your three options (overlay, upstream it, or an explicit opt-out in
`governance/opt-out.json`). A **lower layer must never cite a higher one** — the gate rejects it, because
a project that adopts the core alone would inherit a rule pointing at a document it does not have.

The same split applies to **config (ADR-CORE-032)**: governed config is pinned; project lint/knip settings go
into the overlays `eslint.config.project.mjs` / `knip.project.json`; `tsconfig*.json`, build config and
`.prettierignore` are project-owned; anything else diverges via `governance/opt-out.json`.

**Working in a project downstream?** Read [`docs/migrations/`](docs/migrations/README.md) — one briefing
per upstream change, telling you what to do and what is now forbidden; `governance:update` prints them.

**Delegating to subagents?** Pick the right model (Opus critical / Sonnet medium / Haiku search) and
make them inherit the governance (ADR-CORE-022). They must not develop around the project rules.

## Universal conventions

- Code, comments and commits in **English**; **Conventional Commits**.
- Every landing change bumps SemVer by its commit type; a release happens only on the maintainer's
  explicit word (rule:versioning).
- Node is the one thing the governance assumes of a project — it runs the governance scripts. It says
  nothing about what the project itself is written in.

## Essential governance commands

```bash
npm run check:all         # the full gate — the project composes it; governance:check is always in it
npm run governance:sync   # regenerate ADR/rule/memory indexes + re-pin the layer this repo owns
npm run governance:check  # front-matter, index freshness, links, layer boundaries, drift
npm run governance:update # pull the upstream layers into this repo (consumers only)
```

## Docs

- ADR index: [`docs/adr/README.md`](docs/adr/README.md) · machine manifest: `docs/adr/manifest.json`
- Implementation plan: [`PLAN.md`](PLAN.md)
