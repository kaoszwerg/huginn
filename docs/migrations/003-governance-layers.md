# 003 — Governance is layered now; your upstream did NOT change (ADR-033)

Audience: the agent working in a project built on `saga-rust-template` (e.g. `ivaldi`).

## What changed

The governance split into **layers**:

| Layer     | Owned by                             | What it holds                                                     |
| --------- | ------------------------------------ | ----------------------------------------------------------------- |
| `core`    | **althing** (new, stack-agnostic)     | the agnostic rules, ADRs and governance scripts — no stack at all  |
| `app`     | **saga-rust-template**                | the Tauri 2 + Rust + React HUD shell: its ADRs, rules, lint gates  |
| `project` | **you**                               | unchanged: `.claude/rules/project/`, `docs/adr/project/`, `scripts/project/`, your config |

`saga-rust-template` now consumes `core` from althing and publishes **both layers** onward to you.

## What you must do

**Nothing about your upstream.** This is the important part:

- Your `governance/manifest.json` keeps `"upstream": "kaoszwerg/saga-rust-template"`. **Do not point it
  at althing.** You would lose the entire app layer — the Tauri shell, the HUD design system, the Rust
  conventions — because althing does not ship them and never will.
- You need **no** `governance/config.json`. A project that owns no layer of its own is a *leaf*, and the
  governance derives that from your manifest automatically. Adding the file with `"layer"` set would make
  the gate demand that you pin and publish a layer you do not have.
- `npm run governance:update` keeps working exactly as before, and now prints which layer each file came
  from.

**One thing may go red on your next `check:all`,** and it is not a regression — it is a new gate finding
something that was already broken:

- **Dead governance citations.** The gate now resolves every `ADR-NNN` and `rule:<slug>` mentioned in the
  body of a rule or ADR. A citation of a document that does not exist is now an error
  (`cites ADR-0NN, which does not exist`). If one of your project rules/ADRs cites something that was
  renamed or never existed, fix the citation.
- **`rule-versioning` became `rule:versioning`.** It was the only rule id in the corpus using a hyphen
  instead of the `rule:` prefix that every citation uses, so a reference to it never resolved. If you
  cite it anywhere, use `rule:versioning`.

## What is now forbidden

- **Editing a file that belongs to the `core` or `app` layer.** Unchanged from before, but the error
  message now names the layer and its source. Your three options are the same (ADR-032): a project
  overlay (`eslint.config.project.mjs`, `knip.project.json`), upstreaming the change, or an explicit
  opt-out in `governance/opt-out.json`.
- **A lower layer citing a higher one.** If you ever contribute upstream: a core rule may not cite an app
  ADR. A project that adopts the core alone would be handed a rule pointing at a document it does not
  have. The gate rejects it (`a lower layer must not depend on a higher one`) and names the fix — keep the
  policy in the core, move the stack-specific half into a companion document in the app layer.
- **Opting out a file you own.** An opt-out only takes an *upstream*-owned path out of the pin. On a file
  in your own layer it would silently stop publishing it; the gate rejects that too.

## Where the stack facts went

`CLAUDE.md` is core now, so it is agnostic — it no longer says "Tauri 2 desktop app" or lists
`npm run app:dev`. Those facts did not disappear: they moved into the app layer as
[`.claude/rules/stack-tauri.md`](../../.claude/rules/stack-tauri.md), which is `load: core` and therefore
read at boot, exactly like `CLAUDE.md` itself. You receive it through `governance:update`. What **this**
project is stays where it always was: `.claude/memory/project-scope.md`, project-owned.

## Why

One repo can now be a consumer and a publisher at the same time. Without that, the agnostic core could
never have been extracted: either the stack governance would have had to move into althing (making the
"portable" core own a HUD design system), or it would have been frozen into a copy inside every desktop
project and diverged. See [ADR-033](../adr/033-governance-layers-cascade.md).
