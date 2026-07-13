# Plan

The roadmap for the governance core. Anything here must be true for **any** project (mem:project-scope).

## Done

- Extracted the agnostic core from `saga-rust-template` (rules, ADRs, memory, governance scripts).
- Layered governance + cascade (ADR-033): consumer _and_ publisher in one repo, derived layer
  attribution, collision + acyclicity gates, `--adopt`.

## Next

- **`governance:init`** — bootstrap the core into a repo that has none (write `governance/config.json`,
  pull the core, seed `project-scope.md`, wire the hooks). Today a new consumer is set up by hand plus
  `--adopt`; that is a documented path, not a comfortable one.
- **A second, non-Tauri consumer.** The core is only _proven_ portable once a project that is not a
  desktop app runs it. Until then, "stack-agnostic" is a claim backed by a gate, not by a user.
- **Optional layers (packs).** The machinery already supports more than one published layer; a
  reusable `node-ts` layer (lint/knip/test config for any TypeScript project) is the obvious first one.

## Not planned

- Anything that names a framework, a build tool or a design system. That belongs in a layer above.
