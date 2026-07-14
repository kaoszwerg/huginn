# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (ADR-CORE-024).

## [Unreleased]

### Added

- **On-device speech recognition — the product now does the thing it is for.** Holding the hotkey
  records from the microphone; releasing it transcribes the audio with whisper.cpp and inserts the
  recognised text into the application you were working in. **The recogniser runs in a separate,
  deprivileged worker process** (`huginn-asr-worker`) with no keyboard, no network and no filesystem
  beyond the model file — the process that holds the microphone and synthesises keystrokes never parses
  a model file itself (ADR-PROJ-005). Proven microphone-free end to end: a known German fixture goes
  through the real worker over the real protocol and the expected words come back
  (`cargo test -p huginn-asr-worker --test pipeline -- --ignored`), at ~5–9× real time on the base model.
- **Audio is cleaned before recognition, not fed raw.** Capture (`cpal`) → mono → a **Butterworth
  low-pass resample to 16 kHz** → peak normalisation. The low-pass is not cosmetic: naïve
  nearest-neighbour resampling aliased speech into noise and made the model hallucinate words; the
  fixture only recognises cleanly with the filter in place (regression-tested in `huginn-audio`).
  **The audio never touches the disk and never leaves the process except into the worker's pipe**, and
  the buffer is dropped the moment the transcript is produced (ADR-PROJ-007).
- **A model catalogue compiled into the binary — the only network connection Huginn ever opens**
  (ADR-PROJ-006). Models are chosen and downloaded from the settings, user-triggered and never on
  launch; each is verified against a **SHA-256 that ships in the signed binary** before it is used, and a
  mismatch deletes the file rather than trusting it. There is no remote manifest and no update check (an
  update check is a phone-home). The UI names the host that learns the user's IP before the click.
- **The process monitor** (ADR-PROJ-008): every slow operation — download, checksum, model load — is a
  Job with a label, byte-accurate progress, an **honest ETA computed from the measured rate** (absent,
  never invented, when it cannot be), and a cancel button that actually stops the work. Job state lives
  in Rust, so closing the window does not kill a download. The `Job` type is generated from Rust via
  `ts-rs` and imported by the frontend, never retyped.
- **Everything is configurable, in the app** (ADR-PROJ-004): the microphone (a vanished device falls
  back to the default rather than losing the sentence), the recognition model, and an optional short
  tone when recording starts and stops — often the only confirmation that push-to-talk really opened the
  microphone.
- **The interface speaks German and English from the first release**, German as the default and fallback,
  with the locale shape derived from TypeScript so a missing key is a build error, not a blank label.
  Recognition ships German first (the multilingual weights, which also cover English); other recognition
  languages are optional downloads later, never bundled.
- **Huginn stays alive when you close its window — and that is now the default.** The hotkey is the
  product, and it only works while the process runs; quitting on a window close would silently take
  dictation away system-wide. The tray icon is therefore **always** installed (an app that lives in the
  background without one cannot be opened or quit), and its menu states, in its first line, whether
  push-to-talk is actually armed — the user should not have to discover a dead key by speaking into it.
- **Autostart** (`tauri-plugin-autostart`), off by default: nothing adds itself to a user's startup
  unasked. The **operating system is the source of truth** for whether it is on — the switch reads back
  what the OS reports rather than caching a copy that would drift the moment the user removes the entry
  themselves. Verified on Windows only (the registry entry is absent by default, as it should be);
  macOS is untested until the Mac (PLAN.md phase 1b).
- **Push-to-talk, end to end — and proven.** Hold the hotkey, a focus-neutral overlay appears over the
  application you are working in, and on release text is inserted straight into it (`SendInput`, Unicode,
  so it is layout-independent). The proof is not a claim: `scripts/project/prove-focus-neutrality.ps1`
  drives the real app against a real target window and reads back what the target actually received —
  `SPIKE 1a.1 PASSED`, report in [`docs/spike-1a-windows.md`](docs/spike-1a-windows.md). Windows only;
  the macOS half is written and measured on the Mac (PLAN.md phase 1b).
- **The hotkey is configurable, and its failure is visible.** A recorder in the settings (press the
  combination, it is captured), validated against the platform's known refusals — media keys (which
  would trigger the macOS Input-Monitoring prompt), Option-only combinations (rejected by macOS
  Sequoia), and `Fn` (which `global-hotkey` cannot map on any platform). If the OS refuses the
  combination — `Ctrl+Alt+Space` was already taken on the maintainer's machine — the window **says so**,
  with the reason and a button that goes to the setting. A dictation app whose only key silently does
  nothing is indistinguishable from a broken one.
- **Light and dark themes**, following the desktop by default and overridable in the settings.
- **Idle-cost measurement tool** (`scripts/project/measure-idle.mjs`) covering the whole process tree,
  including the WebView2 hosts where most of the cost actually is.

- **Huginn — the scaffold and the decisions.** The repo was rebased on `saga-rust-template` (it had been
  created from `althing`, the governance core, which ships no application shell) and adopted as a leaf
  consumer: `core` from althing plus `app` from saga, 103 pinned files, publishing nothing.
- **The architecture, written down** — ADR-PROJ-001 … 009: the UI stack (Tauri 2 + React; egui, iced,
  Slint, GPUI, Dioxus-native, Freya, Xilem and Makepad were evaluated and rejected, with the reasons and
  the open upstream issues); the provisional publisher identity and the release-blocker gate; Huginn's own
  visual identity; the focus-neutral overlay and the platform-native window code it requires; the speech
  pipeline and its deprivileged worker process; the model catalogue compiled into the binary and the only
  network call in the product; the storage layout and the rule that recognised text never reaches a log;
  the Job contract behind the process monitor; and the Cargo workspace.
- **Project rules** an agent actually loads at the point of work: `rule:jobs`, `rule:speech-and-privacy`
  (`load: core`), `rule:overlay-and-input`, plus Huginn's own `rule:theming` and `mem:glossary`.
- **`release:check`** (`scripts/project/check-release-ready.mjs` + `release-blockers.json`): a bundled
  build refuses while the publisher, the Apple Developer account, the licence, the trademark check or the
  design system is still open. Wired into `beforeBuildCommand`, so it covers a local `tauri build` and the
  tag-triggered CI release alike. `HUGINN_UNRELEASABLE_BUILD=1` allows an explicitly-labelled test build;
  CI never sets it.

### Changed

- **Huginn's own visual identity replaces the template's neon HUD** (ADR-PROJ-003) — this closes one of
  the five release blockers. Gone: the cyan/green/gold neon palette, the chamfered `clip-path` corners,
  the glow shadows, the animated conic-gradient window frame, and the Orbitron display font. In their
  place: one calm slate palette with a single steel-blue accent, quiet radii, hairline borders, and the
  system typeface. Colour still lives in exactly two mirrored places (`globals.css` + `palette.ts`), and
  every control is still a primitive in `src/components/ui/**` — the mechanism was right, the look was
  not ours.
- **The overlay window is built once and shown/hidden, not created and destroyed** (ADR-PROJ-004,
  amended). Forced by measurement: `WebviewWindowBuilder::build()` takes the keyboard focus the instant
  it returns — even with `.visible(false)` and `.focused(false)` — which would have sent every dictated
  word to the wrong window. As a side effect, the overlay now appears in **3 ms instead of 158 ms**.
- Identity is Huginn (`huginn`, `ai.lysis.huginn` — provisional, ADR-PROJ-002); CSS tokens renamed
  `--saga-*` → `--huginn-*`.
- **The template's design decisions are retired, not owned** (ADR-CORE-035, migration 005): ADR-PROJ-003
  declares `supersedes: [ADR-APP-020]`, `rule:design-system` retires `rule:theming`, and
  `mem:huginn-glossary` retires `mem:glossary`. The upstream files stay pinned and keep receiving updates;
  `context-for.mjs` no longer hands them to an agent. **No opt-out is needed** — `governance/opt-out.json`
  is gone, all 106 governed files stay in the pin.
