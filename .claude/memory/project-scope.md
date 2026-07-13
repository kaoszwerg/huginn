---
id: mem:project-scope
title: Huginn scope summary
tldr: "Huginn is a fully local, system-wide voice input for Windows and macOS (Tauri 2 + Rust + React). Its only network call is a model download the user clicks."
scope: project
load: core
type: project
---

# Huginn — scope summary

**One line:** Huginn is a fully local, system-wide **voice input** for Windows and macOS. Hold a global
hotkey, speak, release — the recognised text is inserted into whatever application has focus. Speech is
processed **on the device**. No cloud, no telemetry, no stored recordings.

The name is Odin's raven of thought: it takes in what is spoken and brings back something usable. That
is a reason for the name — never a licence to listen, store or profile.

## What this repo is

A **leaf project** in the governance cascade (ADR-CORE-033):

```
althing                    (owns 'core' — stack-agnostic rules, ADRs, gate)
  └── saga-rust-template   (owns 'app'  — Tauri 2 + Rust + React shell, CI, version/identity SSOT)
        └── huginn         ← this repo. Consumes both. Publishes nothing.
```

Huginn owns **no** published layer. Its own governance lives in the project line —
`docs/adr/project/proj-NNN-*.md`, `.claude/rules/project/`, `scripts/project/` — and is never pinned.
Everything else here is upstream-owned and **read-only**; the drift gate enforces it.

## The decisions that shape everything (read the ADR before you contradict one)

| | |
| --- | --- |
| **Stack** | Tauri 2 + Rust + React, on the saga shell. Pure-Rust GUI toolkits were evaluated and rejected — ADR-PROJ-001 |
| **Overlay** | Transparent, always-on-top, click-through — and **focus-neutral**. It must not steal focus, or the recognised text has nowhere to go. No cross-platform API delivers that; the overlay window is created with platform-native code — ADR-PROJ-004 |
| **Speech** | whisper.cpp, in a **separate deprivileged process**. The main process holds the microphone, the keyboard and macOS accessibility rights; it must never be the one parsing a model file — ADR-PROJ-005 |
| **Models** | A small base model ships in the installer (offline from launch one). Larger ones are an explicit download from a catalogue **compiled into the binary**. Users may import their own model file — ADR-PROJ-006 |
| **Network** | Exactly **one** outbound activity exists in the entire product: a model download the user clicked. No telemetry, no auto-update, no ping — ADR-PROJ-006, rule:privacy |
| **Jobs** | Nothing longer than ~200 ms runs invisibly. Every such operation is a Job: async, with progress and an ETA, cancellable, shown in the footer's process monitor — ADR-PROJ-008 |
| **Storage** | Lowercase `huginn/` directories, resolved through the platform API. **The recognised text is never written to a log** — that would turn the log into a transcript of everything the user ever said — ADR-PROJ-007 |
| **Design** | The template's neon HUD look is **not** Huginn's and is being replaced: calm, restrained, professional — ADR-PROJ-003 |
| **Crates** | One Cargo workspace, rooted at `src-tauri/` (forced: the pinned `sync-version.mjs` writes there) — ADR-PROJ-009 |

## What must never happen here

- **Audio or recognised text leaving the device.** Not in a log, not in a crash report, not in
  telemetry, not "just for diagnostics". The product's entire proposition is that it does not.
- **Recording without an explicit user action.** No wake word, no always-listening, no "convenient"
  auto-start of capture.
- **A silent network call.** Any egress that is not the user clicking "download this model" is a defect
  and needs its own ADR before it exists (rule:privacy).
- **Code downloaded at runtime.** Models are *data*, verified against a compiled-in SHA-256. Binaries,
  DLLs and GPU backends are shipped, never fetched (ADR-PROJ-006).

## Open decisions (they block a release, not the work)

The publisher (company vs. personal org, and therefore the bundle identifier), the Apple Developer
account, the project licence and the trademark check are **deliberately deferred** — and
`npm run release:check` refuses to produce a release build while any of them stands open (ADR-PROJ-002).

**Why:** Huginn is a privacy product before it is a dictation product. Almost every "convenient" shortcut
available to a voice tool — logging the transcript to debug it, checking for model updates in the
background, parsing the model in the process that already has the microphone — would quietly destroy the
one thing it is for. Those shortcuts are cheap to take and expensive to undo, so the boundaries are
written down before the code exists, not after a report.

**How to apply:** Before adding anything that records, stores, sends or parses, find the ADR that already
decided it (the table above) and read it. If your change contradicts one, stop and surface it — do not
work around it (ADR-CORE-002). If no ADR covers it, it is a new decision: write one.
