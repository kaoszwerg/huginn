# 004 — ADR ids carry their layer now: `ADR-CORE-004`, `ADR-APP-026`, `ADR-PROJ-105`

Audience: the agent working in any project that consumes this core.
Layer: **core** (delivered by `governance:update`).

## What changed

Every ADR id now names the layer that owns it (ADR-CORE-034):

| before    | after          | owned by                          |
| --------- | -------------- | --------------------------------- |
| `ADR-004` | `ADR-CORE-004` | the agnostic core (`althing`)     |
| `ADR-026` | `ADR-APP-026`  | the app/stack layer that ships it |
| `ADR-105` | `ADR-PROJ-105` | your project — never published     |

**The numbers are unchanged.** `ADR-026` became `ADR-APP-026`, not `ADR-APP-001`. The mapping is 1:1, so
every `ADR-026` in your git history, in an old commit message or in a PR description, is still decodable
by a human. Filenames match the id (`core-004-….md`, `app-026-….md`, `proj-105-….md`).

## What you must do

**Rename your own project ADRs and fix your own citations.** The upstream layers arrive already renamed;
your project layer is yours.

1. `docs/adr/project/NNN-<slug>.md` → `docs/adr/project/proj-NNN-<slug>.md`
2. In each: `id: ADR-NNN` → `id: ADR-PROJ-NNN` (and any `supersedes` / `superseded-by`)
3. Rewrite every citation in your project layer — rules, ADRs, memory, README, CHANGELOG, and any comment
   in your own code that names an ADR. A bare `ADR-105` no longer resolves to anything.

**You cannot forget one.** The dead-citation check matches the *legacy* form too, so any surviving
`ADR-NNN` fails `governance:check` with `cites ADR-NNN, which does not exist`. Run
`npm run governance:check` and work the list to empty — that is the migration.

## What is now forbidden

- **An ADR whose id disagrees with the layer that owns it.** The gate compares the layer the id *claims*
  against the layer the manifest says owns the file, and rejects a mismatch with the corrected id in the
  message. This is the check a bare number could never support — a number cannot contradict reality; a
  prefix can, so it can be verified.
- **Bare `ADR-NNN` in a new document.** It resolves to nothing and fails the build.
- **Number blocks.** They are gone, and they were never sound: the app layer already held 001, 020, 021,
  023, 025, 026 and 031 — all of them inside the core's supposed range. Each layer now numbers
  independently from `001`, and there is nothing to coordinate.

## Why

`ADR-033` made governance a stack of layers. A citation like "`ADR-026`" then reads as perfectly ordinary
prose while in fact being a **layer violation** — the core reaching up into the app layer — and nothing in
the identifier said so. Now it does, and the gate can prove it.
