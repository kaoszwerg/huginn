# Huginn

**Local voice input. Private by design.**

Huginn is a fully local, system-wide voice input for Windows and macOS. Hold a hotkey, speak, release —
the recognised text is inserted into whatever application has focus. Speech is turned into text **on the
device**: no cloud, no telemetry, no stored recordings.

The name is Odin's raven of thought — the one that takes in what is spoken and brings back something
usable. It is a reason for the name, not a licence to listen.

> **Status: scaffold.** The governance, the decisions and the quality gate are in place; the product is
> not built yet. Start at [`PLAN.md`](PLAN.md).

## What it does — and what it will never do

- Records **only** while you hold the hotkey. No wake word. No always-listening.
- Transcribes **on your machine**, in a separate, deprivileged process that has no network access.
- Ships with a model, so it works offline from the first launch. Bigger models are an explicit,
  user-clicked download.
- **Exactly one** outbound network activity exists in the entire product: that download. No telemetry, no
  crash reporting, no auto-update ping.
- **Never writes the recognised text to a log.** A log full of transcripts is a diary of everything you
  have ever said; Huginn does not keep one.

## Development

```bash
npm ci
npm run app:dev      # run the app (dev build — its own identity, its own data directory)
npm run check:all    # the full gate; everything must be green before anything lands
```

The gate runs `typecheck`, `eslint`, `prettier`, `vitest`, `knip`, `secretlint`, the governance checks,
`cargo fmt`, `clippy -D warnings`, `cargo test`, `cargo-deny` and `cargo-audit`. It runs pre-commit and
pre-push; CI is a backstop, not the first line of defence.

A **bundled** build additionally runs `npm run release:check`, which refuses while any deferred decision
is still open ([`release-blockers.json`](release-blockers.json), ADR-PROJ-002). Need a bundled build to
_test_ something? Say so, and the artefact labels itself:

```bash
HUGINN_UNRELEASABLE_BUILD=1 npm run app:build     # PowerShell: $env:HUGINN_UNRELEASABLE_BUILD=1
```

## For the agent working here

Read [`CLAUDE.md`](CLAUDE.md) first, then the indexes it names, then
[`.claude/memory/project-scope.md`](.claude/memory/project-scope.md) — it says what this project is and
which decisions you may not contradict without reading their ADR.

Huginn is a leaf in a governance cascade: `althing` (the stack-agnostic core) → `saga-rust-template` (the
Tauri 2 + Rust + React shell, CI, the version and identity SSOTs) → **huginn**. Everything those layers
own is pinned and **read-only** here; Huginn's own governance lives in `docs/adr/project/`,
`.claude/rules/project/` and `scripts/project/`.

## Licence

Undecided, deliberately — it is a tracked release blocker (ADR-PROJ-002). Until it is decided, no
copyleft dependency enters the project, so every option stays open.
