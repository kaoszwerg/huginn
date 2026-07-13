# Project ADRs (project-owned governance line)

Domain / architecture decisions specific to **this** project live here as `NNN-*.md` — use numbers
from **100** up, so they can never collide with an ADR an upstream layer publishes. They are indexed and
validated by the same governance scripts, but they are **not** part of any published layer
(`governance/manifest.json`): this project owns them, and `governance:update` never touches this folder
(ADR-033).

A project ADR may freely cite an ADR from a layer below it (the core, an app layer) — the project layer
is the highest, so nothing depends on it. The reverse is forbidden and the gate rejects it.
