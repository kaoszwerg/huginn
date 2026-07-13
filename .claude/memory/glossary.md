---
id: mem:glossary
title: Domain glossary
tldr: "Shell terms: HUD design system, HudPanel, capability, IPC command, DTO/bindings, ring buffer, build channel, governance index."
scope: global
load: core
type: reference
---

# Glossary

- **Shell** — everything in this repo today: window chrome, navigation, logging, settings,
  governance. Carries no product logic.
- **HUD design system** — the dark, chamfered, neon-accented look defined in `src/styles/globals.css`
  (ADR-APP-020). `HudPanel`, `hud-btn`, `hud-clip` and the `hud-accent-*` utilities are its primitives.
- **IPC command** — a `#[tauri::command]` in `src-tauri/src/commands/`, invoked from the frontend
  through the typed wrappers in `src/api/commands.ts`.
- **DTO / bindings** — a Rust struct deriving `ts-rs::TS` (in `src-tauri/src/dto.rs`) plus its
  generated TypeScript type under `src/bindings/`. The Rust side is the single source of truth;
  regenerate with `npm run gen:types`.
- **Capability** — the least-privilege permission set the webview is granted
  (`src-tauri/capabilities/default.json`, ADR-CORE-011).
- **Ring buffer** — the bounded in-memory log store in `logging.rs` (last ~2000 records) that backs
  the Logs view's initial load; new records are pushed live over the `log://record` event (ADR-APP-025).
- **Build channel** — `dev` or `release`, derived from `debug_assertions` and surfaced in
  `BuildInfo` (ADR-CORE-024). The title bar shows a DEV badge for dev builds.
- **Governance index** — the generated `docs/adr/manifest.json`, `.claude/rules/INDEX.md` and
  `.claude/memory/MEMORY.md`; regenerate with `npm run governance:sync` (ADR-CORE-007).
