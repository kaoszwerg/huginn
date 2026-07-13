# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The portable governance core**, extracted from `saga-rust-template`, where the "portable" core had
  grown together with a Tauri desktop shell: pinned core files prescribed HUD primitives, `tracing` sinks
  and `Serialize for AppError`, and of the fourteen steps in that repo's `check:all` only two were free of
  a stack. This repo holds the half that is true for any project.
- **Layered governance (ADR-033).** Governance is now N ordered layers (`core` → an app layer →
  `project`). A repo consumes its upstream's layers, may own one of its own, and publishes the union
  downstream — so one repo can be a consumer and a publisher at the same time. Layer membership is
  derived from the upstream manifest, never annotated, so no path had to move.
- **Three layer gates** in `governance:check`: drift (unchanged), id collision across layers, and
  **acyclicity** — a lower layer may not cite a higher one, checked for markdown links _and_ bare
  `ADR-NNN` / `rule:<slug>` citations. This is what keeps the core adoptable by a project that takes the
  core alone.
- **`governance-update.mjs --adopt`** — the one-time step a repo runs when it first takes an upstream. It
  copies and re-attributes every governed file to its owning layer, and **never deletes**. Without it the
  first ordinary update would delete the entire layer the adopting repo owns, because every file of that
  layer is by definition absent from the upstream's manifest.

### Fixed

- `rule:versioning` was `rule-versioning` — the only rule id in the corpus using a hyphen instead of the
  `rule:` prefix every citation uses, so no reference to it ever resolved.
