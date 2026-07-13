# Project ADRs (project-owned governance line)

Domain / architecture decisions specific to **this** project live here as `proj-NNN-*.md`, with the id
`ADR-PROJ-NNN` (ADR-CORE-034). The layer is part of the identifier, so a project ADR can never collide
with one an upstream layer publishes, and no number ranges have to be negotiated: number them from `001`
or continue your own sequence, as you like.

They are indexed and validated by the same governance scripts, but they are **not** part of any published
layer (`governance/manifest.json`): this project owns them, and `governance:update` never touches this
folder (ADR-CORE-033).

A project ADR may freely cite an ADR from a layer below it (the core, an app layer) — the project layer
is the highest, so nothing depends on it. The reverse is forbidden and the gate rejects it.
