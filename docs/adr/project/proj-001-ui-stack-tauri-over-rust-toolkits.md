---
id: ADR-PROJ-001
title: UI stack — Tauri 2 + React on the saga shell, not a pure-Rust GUI toolkit
status: accepted
tldr: "Tauri 2 + React on the saga shell. egui, iced, Slint and GPUI were evaluated and rejected: same native overlay cost, no workbench, lower design ceiling."
scope: architecture
load: conditional
triggers:
  [
    stack,
    ui,
    framework,
    toolkit,
    egui,
    iced,
    slint,
    gpui,
    dioxus,
    freya,
    xilem,
    webview,
    react,
    tauri,
  ]
applies-to: ["src/**", "src-tauri/**", "package.json"]
supersedes: []
superseded-by: null
---

## Context

Huginn needs two surfaces: a small **overlay** shown while recording (transparent, borderless,
always-on-top, click-through, and — the hard one — **focus-neutral**: it may not take focus from the
application the user is dictating into) and a **settings window** that has to look genuinely good, stay
maintainable for years, and cost nothing in licence fees.

The obvious reading of the product brief ("one shared Rust UI") pointed at a pure-Rust toolkit. That
reading was tested against the actual state of the ecosystem (July 2026) rather than its reputation.

**What the survey found** — the decisive fact first:

- **Focus-neutrality is not reachable through any cross-platform UI API on macOS.** Not Tauri
  (`focused(false)` is "unsupported on macOS" per maintainer; `focusable: false` still steals focus —
  tauri#9065, #14102, #15017, all open) and not winit, which sits under egui and iced. macOS requires a
  non-activating `NSPanel`, written against `objc2`. **This cost is identical in every option**, so it
  cannot decide the framework.
- **Transparency is the weak spot in every pure-Rust toolkit**, at the renderer, not the window API:
  egui — transparency on child viewports broken on Windows (#3632, open); iced — renders **black**
  instead of transparent with the default wgpu renderer (#2525, open); Slint — black with the Skia
  renderer on Windows (#4120, open).
- **Slint** has the best design-system story and a company behind it, is free for proprietary desktop
  apps under the Royalty-free licence (attribution required: `AboutSlint` widget or a badge) — but has
  **no click-through API at all** (maintainer-confirmed) and repaints the **whole window** on desktop,
  costing 10–14 % CPU during live text: exactly Huginn's overlay-during-dictation path.
- **egui** would mean building the design system from scratch (Rerun had to write `re_ui` for precisely
  this) and fighting immediate mode as the app grows.
- **iced** has the cleanest window API of the three and no accessibility support at all, plus 14.5
  months without a stable release and a deprecated component trait.
- **The "next generation" is not shippable**: Dioxus-native/Blitz self-describes as pre-alpha and has no
  transparency, no always-on-top, no click-through and no tray; Freya has one contributor and no stable
  release; Xilem/Masonry still says "experimental"; Makepad has no CI at all. GPUI (Apache-2.0, now on
  Windows) is real but pre-1.0 with "often breaking changes" and a documentation trail that ends in
  Zed's source.
- **Tauri 2 ships this exact product today**: `cjpais/Handy` is a released Tauri 2 dictation app with a
  transparent always-on-top recording overlay on Windows and macOS.
- **The workbench matters more than the runtime.** `saga-rust-template` hands Huginn a 14-step
  `check:all` (typecheck, lint, format, tests, knip, secrets, governance, `cargo fmt`, `clippy -D
  warnings`, `cargo test`, `cargo-deny`, `cargo-audit`), a cross-platform signed release pipeline, the
  version and identity SSOTs, and the Rust/logging conventions. Rebuilding that for a pure-Rust project
  is weeks of work that produces no product — and ADR-CORE-005 forbids duplicating a source that exists.

## Decision

- **Tauri 2 + Rust + React**, adopting **`kaoszwerg/saga-rust-template`** as the governance upstream
  (which transitively delivers the `core` layer from `althing`). Huginn is a leaf: it publishes nothing.
- **The overlay window is opened with platform-native code**, from the first line — `WS_EX_NOACTIVATE`
  via the `hwnd()` escape hatch on Windows, a non-activating `NSPanel` via `objc2` on macOS. The Tauri
  window API is used for everything it *can* do (transparency, always-on-top, decorations,
  `set_ignore_cursor_events`) and is not asked for what it demonstrably cannot (ADR-PROJ-004).
- **The webview cost is accepted and contained**: the overlay exists **only while recording** and is
  destroyed afterwards, which is what the privacy promise requires anyway — and it sidesteps
  tauri#15471 (a transparent window costs ~8× GPU power on macOS, permanently, even when static).
  The settings window is created lazily and destroyed on close.
- **The design system is Huginn's own** (ADR-PROJ-003); saga's HUD look is not adopted.

## Alternatives

- **Slint** — rejected: no click-through (two hand-written platform paths, with no example in its own
  repo), full-window repaints during live text, and a visible attribution obligation. Its strengths
  (design system, company backing) do not outweigh a missing capability the product is built on.
- **egui** — rejected: the design system becomes a side project, and immediate mode invites business
  logic into the UI as the app grows. It remains the fallback if the webview is ever ruled out.
- **iced** — rejected: transparency is *the* core requirement and it is the one that is broken; plus no
  accessibility.
- **GPUI, Dioxus-native/Blitz, Freya, Xilem, Makepad** — rejected: pre-1.0, pre-alpha, bus-factor 1, or
  without CI. Xilem is the one to re-evaluate in a few years.
- **Consuming `althing` directly** (core only, no app layer) — rejected: it would mean rebuilding saga's
  entire Tauri workbench inside Huginn, which is exactly the duplication ADR-CORE-005 exists to prevent.

## Consequences

- Two toolchains (Cargo + npm) and a webview in the process. The webview's idle cost is **not** proven
  by any credible published measurement; it is measured in the first spike, not assumed.
- Platform-native window code is a permanent, owned part of the codebase — not a workaround to be
  removed later.
- `macos-private-api` is required for transparency on macOS, which rules out the Mac App Store. That is
  a decided trade-off (ADR-PROJ-002): distribution is a notarised DMG.
- **Nothing here is committed to before the spike.** The first task in `PLAN.md` proves the overlay
  (transparent + focus-neutral) on Windows **and** in a signed build on real macOS hardware. If
  focus-neutrality cannot be achieved, this ADR is reopened before product code exists.

## References

- ADR-PROJ-004 (overlay & input), ADR-PROJ-003 (design), ADR-CORE-005 (reuse), ADR-APP-001 (the shell's
  own stack decision).
- tauri#9065, #14102, #15017 (focus), #15471 (transparent = GPU cost on macOS), #13415 (transparency
  lost in a release DMG); egui#3632; iced#2525; slint#4120; `github.com/cjpais/Handy`.
