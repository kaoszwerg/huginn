---
id: ADR-PROJ-009
title: Crate structure — one Cargo workspace, rooted at src-tauri/
status: accepted
tldr: "One Cargo workspace rooted at src-tauri/ (the pinned sync-version.mjs writes there). Nine crates, each earning its place; cross-cutting concerns are not crates."
scope: architecture
load: conditional
triggers: [crate, crates, workspace, cargo, module, structure, layout, sidecar, manifest]
applies-to: ["src-tauri/Cargo.toml", "src-tauri/crates/**"]
supersedes: []
superseded-by: null
---

## Context

The product brief sketched fifteen crates. Two constraints reshape that.

**A forced one.** `scripts/sync-version.mjs` is **pinned** (upstream-owned, ADR-CORE-024): it writes the
product version into `src-tauri/Cargo.toml`'s `[package] version` and into `src-tauri/Cargo.lock`, and
`cargo audit --file src-tauri/Cargo.lock` reads the lockfile from the same place. A workspace rooted at
the repo root would require editing that pinned script — which the drift gate blocks, and which opting out
would mean losing every future fix to the version SSOT. So: **the workspace roots at `src-tauri/`.** This
is a constraint, not a preference.

**A judgement one.** A crate must earn its existence. Fifteen crates for a dictation app produce empty
shells and a false sense of separation.

## Decision

```
src-tauri/
  Cargo.toml             # [workspace] + [package] huginn — the Tauri app: UI, tray, hotkey, injection
  Cargo.lock             # THE lockfile — sync-version and cargo audit both point exactly here
  deny.toml              # pinned (upstream)
  crates/
    huginn-core/         # domain types, state machine, errors, config, diagnostics, the Job registry
    huginn-audio/        # capture (cpal), resampling, ring buffer, VAD
    huginn-asr/          # the SpeechEngine trait + the whisper.cpp implementation   (library)
    huginn-asr-proto/    # the app <-> worker wire protocol, pinned by tests on both sides
    huginn-asr-worker/   # the deprivileged BINARY that hosts huginn-asr (Tauri sidecar)
    huginn-platform/     # trait + #[cfg] impls: hotkey, text injection, overlay window, autostart, paths
    huginn-text/         # post-processing: punctuation, dictionary, spoken commands
    huginn-models/       # the compiled-in catalogue, download + SHA-256 verification, local import
    huginn-test-support/ # fixtures, temp dirs, reference WAVs (dev-only)
```

- **Internal crates carry a fixed, meaningless version** (`0.0.0`) and are path dependencies. The product
  version exists **only** in `src-tauri/Cargo.toml`'s `[package]`, where the pinned sync script writes it.
  Two version sources would make `version:check` right to fail.
- **`huginn-asr-worker` is a separate binary** and ships as a Tauri sidecar (ADR-PROJ-005).
- The npm scripts that drive Cargo gain `--workspace` so clippy, tests and deny cover the members.

**What the brief proposed and this ADR drops, with the reason:**

| Dropped | Why |
| --- | --- |
| `huginn-security`, `huginn-privacy` | Cross-cutting concerns are not modules. As crates they become empty shells and invite "the security crate handles that" — the attitude that produces vulnerabilities. They are rules and tests inside **every** crate. |
| `huginn-ui` | The UI is React. A Rust UI crate would have no contents. |
| `huginn-platform-windows`, `-macos` | The Rust idiom is **one** crate with `#[cfg(target_os)]` modules behind a trait. Three crates only pay off if they must build independently. They must not. |
| `huginn-config`, `huginn-diagnostics` | Modules in `huginn-core`. A crate for a TOML file is ceremony. |
| `huginn-vad` | A module in `huginn-audio` — until it drags in an ONNX runtime of its own, at which point the split has a reason. |
| `huginn-app` | That is `src-tauri` itself. |

## Alternatives

- **A workspace at the repo root** (`members = ["src-tauri", "crates/*"]`) — rejected: it needs the pinned
  `sync-version.mjs` to write somewhere else. Opting that script out would trade a tidier directory layout
  for every future fix to the version SSOT. Bad trade.
- **A single crate** — rejected: the deprivileged worker *needs* to be its own binary, and its protocol
  needs to be shared by both sides.
- **The brief's fifteen crates** — rejected as above.

## Consequences

- Product crates live under `src-tauri/crates/`, which reads slightly oddly (they are not Tauri code). The
  alternative was worse; the reason is recorded here so nobody "tidies" it later and breaks the version
  gate.
- One lockfile, one `cargo-deny` run, one `cargo-audit` run — the inherited gate keeps working unchanged.

## References

- ADR-PROJ-005 (the worker and its protocol), ADR-CORE-024 (version SSOT), ADR-CORE-032 (config layering
  and why a pinned script is not edited), rule:rust-conventions.
