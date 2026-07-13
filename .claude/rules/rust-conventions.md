---
id: rule:rust-conventions
title: Rust conventions
tldr: "Edition 2021; one module per responsibility; thiserror errors; blocking work in spawn_blocking; ts-rs for boundary types; fmt + clippy -D warnings clean."
scope: backend
load: conditional
triggers: [rust, cargo, module, async, tokio, ts-rs, tauri]
applies-to: ["src-tauri/**"]
---

# Rust conventions

- **Modules:** one responsibility per module (`logging`, `settings`, `state`, `tray`, `commands`, plus
  a module per domain service); keep `commands/` thin (validate -> call core -> map error).
- **Errors:** a crate-wide `AppError` (`thiserror`) that serialises for IPC; no `unwrap`/`expect` on
  production paths. `Serialize for AppError` is the chokepoint that logs every IPC error — never
  bypass it.
- **Blocking work:** anything that blocks for more than a moment runs inside
  `tokio::task::spawn_blocking`; never block the async runtime.
- **Persistence:** the shell persists settings as an atomically written JSON document
  (`settings.rs`). A database is introduced only when a feature needs one — with its own ADR.
- **Boundary types:** derive `ts-rs::TS` on all DTOs and export them — the TS side imports the
  generated types (SSOT, ADR-CORE-005). Run `npm run gen:types` after changing a DTO.
- **Paths:** resolve app directories through Tauri's `app.path()` — never hardcode platform paths.
- **Lint:** `cargo fmt` + `cargo clippy -D warnings` clean.
