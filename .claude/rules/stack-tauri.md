---
id: rule:stack-tauri
title: The stack — Tauri 2 + Rust + React desktop shell
tldr: "What this app IS: Tauri 2 (Rust src-tauri/ + React src/), ts-rs boundary types, JSON settings, one identity source; plus the commands to build and gate it."
scope: global
load: core
triggers: [stack, tauri, rust, react, vite, desktop, shell, commands, build, bindings, ts-rs]
applies-to: ["src/**", "src-tauri/**", "package.json", "app.identity.json"]
---

# The stack (app layer, ADR-CORE-033)

This is the **application layer**: everything here is true for the Tauri desktop shell and for every
project built on it — and for nothing else. The portable core (`althing`) knows none of it, which is why
it can govern a project that is not a desktop app at all.

`load: core`, so an agent reads this at boot alongside `CLAUDE.md`. `CLAUDE.md` is the agnostic agent
contract; **this file is what the agent is actually building**.

## Quick facts

- **Tauri 2 desktop app:** Rust backend (`src-tauri/`) + React/TS frontend (`src/`). Cross-platform:
  Windows, macOS, Linux (WebKitGTK is the weakest target — rule:cross-platform).
- **The app name/identity has ONE source:** `app.identity.json` → `npm run identity:sync` (ADR-APP-031).
  Never hand-edit the name across files.
- **Persistence:** settings are an atomically written JSON document under the OS app-data dir. A database
  arrives only with the feature that needs one, plus its ADR.
- **Boundary types are generated** from the Rust DTOs (`ts-rs`) — never hand-edit `src/bindings/`. The
  frontend talks to the backend only through the typed Tauri commands wrapped in `src/api/`
  (rule:frontend-architecture).
- **Every control a view touches is a HUD primitive** from `src/components/ui/` — never a native button,
  menu, tooltip or dialog, and never a component straight out of a library. The primitive layer may be
  *built on* anything (a native element, a headless library), but nothing may ship wearing its own look
  (ADR-APP-026, rule:ui-design). A lint gate in `check:all` enforces it.
- **Logging** runs through `tracing` into console + a rotating JSON file + a live UI buffer (ADR-APP-025,
  rule:logging).

## Essential commands

```bash
npm install            # frontend deps + Tauri CLI
npm run app:dev        # run the app (dev build, separate identifier — never call this a release)
npm run check:all      # full gate: typecheck, lint, tests, fmt, clippy, security, governance
npm run gen:types      # regenerate src/bindings/ from the Rust DTOs
npm run governance:sync   # regenerate ADR/rule/memory indexes + re-pin the app layer
npm run governance:check  # validate front-matter, index freshness, links, layer boundaries
npm run governance:update # pull the core layer from althing (this repo only — see ADR-CORE-033)
```

## Where the stack rules live

Load them by task, per rule:context-loading:

| Concern                          | Rule                       |
| -------------------------------- | -------------------------- |
| Rust modules, errors, async, ts-rs | rule:rust-conventions      |
| React state, IPC, data fetching    | rule:frontend-architecture |
| HUD layout, controls, a11y         | rule:ui-design             |
| Colours, chamfers, glow            | rule:theming               |
| `tracing`, sinks, log view         | rule:logging               |
| Windows/macOS/Linux parity         | rule:cross-platform        |
| Version sync, channels, releases   | rule:stack-release         |

**Why:** the core states the *policy* ("log everything", "reuse over duplication", "no native defaults");
this layer states the *mechanism* for this stack. Keeping them apart is what lets the same governance
run a Tauri app and something entirely different — and it is a gate, not an aspiration: a core document
that cites one of the rules above fails `governance:check` (ADR-CORE-033).
