---
id: ADR-APP-021
title: Frameless Tauri window with custom HUD title bar
status: accepted
tldr: "Frameless window; custom HUD TitleBar draggable via data-tauri-drag-region; window controls via the Tauri window API, drawn for all OSes."
scope: frontend
load: conditional
triggers: [window, titlebar, frameless, chrome, decorations, drag]
applies-to: ["src/components/layout/**", "src-tauri/tauri.conf.json"]
supersedes: []
superseded-by: null
---

## Context

The HUD design needs a custom title bar instead of the OS chrome, while staying cross-platform under
Tauri's system WebView.

## Decision

Run a frameless window (`decorations: false` in `tauri.conf.json`). A custom HUD `TitleBar` is the drag
region (`data-tauri-drag-region`) and draws minimize/maximize/close buttons for **all** OSes (consistent
look); the buttons call the Tauri window API (`getCurrentWindow().minimize()/toggleMaximize()/close()`).
CSS animations are plain Tailwind/CSS and run in the WebView. `backdrop-filter`/blur is avoided
(weak on Linux WebKitGTK) — panels use solid HUD backgrounds. The window border is a static
box-shadow neon edge, **not** a `mask`-clipped gradient (the latter was silently broken by the
production CSS minifier — see the window-frame note in `globals.css`).

**Optional system tray & close-to-tray (off by default):**
- The shell is a **normal windowed app** by default — closing the window quits it. Background
  operation is **opt-in** via the `minimize_to_tray` setting (default **off**).
- **When enabled:** a **tray icon** (`tray-icon` feature) with an Open/Quit menu is installed;
  left-click toggles the main window; and the window's close button **hides to the tray** instead of
  quitting, so the app keeps running in the background.
- **Runtime toggle, no restart:** toggling `minimize_to_tray` installs/removes the tray icon
  immediately, and the window's close handler consults the setting per event — so the behaviour
  changes live.
- **No implied background data work.** The tray is purely a windowing convenience; the shell has no
  telemetry, network or background collection (rule:privacy). A feature that needs true unattended
  work (autostart, a receiver, dock-hiding) adds it explicitly with its own ADR and capability.

## Alternatives

- **Native OS chrome** — rejected: breaks the HUD aesthetic.
- **Electron** — rejected by ADR-APP-001; window controls would differ but the trade-offs were accepted there.

## Consequences

- Cohesive HUD chrome on every OS; window controls are our responsibility.
- `decorations:false` must be set before shipping (the dev skeleton may still show OS chrome until then).

## References

- ADR-APP-001 (stack), ADR-APP-020 (HUD), `src/components/layout/TitleBar.tsx`, `src-tauri/tauri.conf.json`.
