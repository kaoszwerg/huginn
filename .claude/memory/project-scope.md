---
id: mem:project-scope
title: althing scope summary
tldr: "althing IS the portable governance core: stack-agnostic rules/ADRs + the layered drift-gate. It ships no product code and must never learn about any stack."
scope: project
load: core
type: project
---

# althing — scope summary

**One-line:** `althing` is the **portable agent-governance core** — the stack-agnostic rules, ADRs and
memory, plus the scripts that index, pin, gate and distribute them. It is the root of the governance
cascade (ADR-033) and has no upstream.

The name is the Old Norse assembly that set the law: the place the rules are decided, from which they
travel outward.

## What exists here

- The **agnostic** rules (`.claude/rules/*.md`) and ADRs (`docs/adr/NNN-*.md`) — everything that is true
  for a project regardless of what it is built from.
- The governance tooling (`scripts/`): index generation + staleness gate (ADR-007), the front-matter and
  reachability validator, `context-for.mjs`, and the layered manifest/drift-gate + `governance:update`
  (ADR-033).
- Migration briefings (`docs/migrations/`) — what a downstream project must **do** after a change here.

## What must never exist here

**Any stack knowledge.** No framework, no language runtime, no build tool, no design system, no product.
The moment a core rule names `cargo`, `tracing`, a React hook or a HUD panel, the core stops being
adoptable by the next project — and the layer gate in `governance:check` rejects it.

The only assumption the core makes about a consumer is **Node**, because that is what runs these scripts.
It says nothing about what the project itself is written in.

## Who consumes it

- `saga-rust-template` — consumes `core`, owns and publishes the **`app`** layer (the Tauri 2 + Rust +
  React desktop shell), and republishes both to its own forks.
- `ivaldi` — a leaf project downstream of `saga-rust-template`. **It never points at althing directly**;
  doing so would strip it of the app layer.

**Why:** the governance was extracted from `saga-rust-template`, where it had grown together with a
Tauri desktop shell — pinned "portable core" files were prescribing HUD panels and `Serialize for
AppError`. Splitting the layers is what lets the same rules govern a project that is nothing like a
desktop app.

**How to apply:** before adding anything here, ask whether it would still be true for a project written
in a language this repo has never heard of. If not, it belongs in a layer above — not here.
