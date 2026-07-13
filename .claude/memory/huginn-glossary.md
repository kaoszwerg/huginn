---
id: mem:huginn-glossary
title: Huginn glossary
tldr: "Huginn's terms: overlay, push-to-talk, injection, ASR worker, model catalogue, base model, Job — plus the shell terms inherited from the template."
scope: global
load: core
type: reference
supersedes: [mem:glossary]
---

# Glossary

The words this project uses, and what they mean **here**.

## The product

- **Overlay (HUD)** — the small, transparent, always-on-top, click-through, **focus-neutral** window shown
  _only while recording_. It must never take focus from the application the user is dictating into, or the
  text has nowhere to go (ADR-PROJ-004).
- **Push-to-talk** — recording runs while the global hotkey is **held** (key-down starts, key-up stops).
  Huginn records on explicit user action only; it never listens on its own.
- **Injection** — writing the recognised text into whatever application currently has focus (synthesised
  keystrokes or a paste, decided per platform — ADR-PROJ-004).
- **ASR worker** — the separate, deprivileged OS process that loads the model and transcribes. No
  keyboard, no network, no filesystem beyond the model file. The app talks to it over a pipe
  (ADR-PROJ-005).
- **Model catalogue** — the list of offerable models (id, URL, SHA-256, size, licence, languages),
  **compiled into the binary and signed with it**. No remote manifest, no update ping (ADR-PROJ-006).
- **Base model** — the small model shipped inside the installer, so Huginn dictates offline from the first
  launch. Larger models are an explicit, user-triggered download.
- **Job** — any operation longer than roughly 200 ms: download, checksum, model load, transcription. Every
  job is asynchronous, has observable progress and an ETA, is cancellable, and appears in the process
  monitor in the footer. Nothing long runs invisibly (ADR-PROJ-008).

## The shell (inherited from the template)

- **IPC command** — a `#[tauri::command]` in `src-tauri/src/commands/`, invoked from the frontend through
  the typed wrappers in `src/api/commands.ts`.
- **DTO / bindings** — a Rust struct deriving `ts-rs::TS` plus its generated TypeScript type under
  `src/bindings/`. Rust is the single source of truth; regenerate with `npm run gen:types`. A boundary
  type is never retyped by hand on the other side (ADR-CORE-005).
- **Capability** — the least-privilege permission set the webview is granted
  (`src-tauri/capabilities/default.json`, ADR-CORE-011).
- **Ring buffer** — the bounded in-memory log store that backs the Logs view; new records arrive live over
  the `log://record` event (ADR-APP-025).
- **Build channel** — `dev` or `release`, from `debug_assertions`. The dev build carries its own bundle
  identifier (`…​.dev`), and therefore its own macOS permissions and its own data directory — it cannot
  damage an installed release.
- **Governance index** — the generated `docs/adr/manifest.json`, `.claude/rules/INDEX.md` and
  `.claude/memory/MEMORY.md`; regenerate with `npm run governance:sync` (ADR-CORE-007).

## Words that are NOT Huginn's

The template's design vocabulary — **HUD design system**, `HudPanel`, `hud-btn`, `hud-clip`, neon, chamfer
— describes the shell Huginn was created from, not Huginn. Its look is being replaced (ADR-PROJ-003). Do
not extend it; do not name new things after it.
