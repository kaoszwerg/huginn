# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (ADR-CORE-024).

## [Unreleased]

### Added

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

- Identity is Huginn (`huginn`, `ai.lysis.huginn` — provisional, ADR-PROJ-002); CSS tokens renamed
  `--saga-*` → `--huginn-*`.
- **The template's design decisions are retired, not owned** (ADR-CORE-035, migration 005): ADR-PROJ-003
  declares `supersedes: [ADR-APP-020]`, `rule:design-system` retires `rule:theming`, and
  `mem:huginn-glossary` retires `mem:glossary`. The upstream files stay pinned and keep receiving updates;
  `context-for.mjs` no longer hands them to an agent. **No opt-out is needed** — `governance/opt-out.json`
  is gone, all 106 governed files stay in the pin.
