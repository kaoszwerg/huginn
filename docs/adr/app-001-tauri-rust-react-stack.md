---
id: ADR-APP-001
title: Tauri 2 + Rust backend + React/TypeScript frontend
status: accepted
tldr: "Desktop app on Tauri 2: Rust owns state, IO and the domain services, React+TS+Vite renders the HUD UI; small native binaries, one web UI for all OSes."
scope: global
load: core
triggers: [stack, tauri, rust, react, vite, frontend, backend, architecture]
applies-to: []
supersedes: []
superseded-by: null
---

## Context

The app must run on macOS, Windows and Linux, present a rich HUD UI, and keep the heavy lifting
(filesystem IO, compute-bound work, native OS integration) fast and native. We want a small
footprint, native performance for the backend, and a single UI codebase across all platforms.

## Decision

Use **Tauri 2** as the application shell. The **backend is Rust**: application state, settings
persistence, logging, tray integration, all filesystem IO, and every domain service added later. The
**frontend is React + TypeScript built with Vite**, talking to Rust through Tauri commands. Types
crossing the boundary are generated from the Rust DTOs via `ts-rs` (single source of truth, ADR-CORE-005).

## Alternatives

- **Electron** — rejected: ~150 MB binaries, high RAM, bundles a full Chromium, and compute-bound
  work would run much slower in JS than in native Rust.
- **Flutter** — rejected: would not let us reuse the existing HUD web design, and pulls in a separate
  Dart toolchain.
- **Pure web app (local server + browser)** — rejected: not a real desktop app; no tray, no window
  chrome control, no OS-level access.

## Consequences

- Native, fast backend in Rust; tiny installers; one React UI for all OSes.
- Frontend renders in the **system WebView** (WebKit / WebView2 / WebKitGTK), not bundled Chromium →
  minor cross-engine differences possible (see ADR-APP-021 for the window-chrome/WebView caveats).
- Two toolchains (Cargo + npm) — unified under one `check:all` (ADR-CORE-008).

## References

- ADR-CORE-008 (quality pipeline), ADR-APP-020 (HUD design), ADR-APP-021 (window chrome), ADR-APP-025 (logging).
