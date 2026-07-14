# Migration briefings

One file per core change that a **project** must know about or act on — written for the agent working
in a fork, not for a changelog reader. They are part of the pinned governance core (ADR-CORE-030), so
`npm run governance:update` delivers them into every project and prints the list at the end of a run.

- Name: **`<layer>-NNN-<slug>.md`** — the layer that owns the briefing is part of the filename, exactly as
  it is part of an ADR id and an ADR filename (ADR-CORE-034, ADR-CORE-038): `core-001-…md` here,
  `app-001-…md` in a stack layer, `proj-001-…md` in a project. Each layer numbers **independently** and
  without bound; there are no ranges to allocate.

  A briefing has no front-matter and no id, so the **filename is its identifier** — and it is the one thing
  two layers can collide on. A collision does not surface here: it lands in the consumer, where
  `detectCollisions` **aborts `governance:update` entirely** until a published file is renamed. The prefix
  makes that structurally impossible, and `governance:check` verifies that the layer a name claims is the
  layer the manifest says owns the file. Number ranges (core `001–099`, app `100–199`, …) were the previous
  answer: prose in this README, checked by nothing, and finite. They are **not** to be reintroduced.
- Content: what changed, what a project must do, and what is now forbidden — concrete, with the exact
  commands and file names. State the mechanism the gate enforces, so an agent that ignores the briefing
  still hits a red `check:all` rather than a silent bypass (rule:knowledge-handover).
- Write one whenever a core change alters how a project must behave. A change no project has to act on
  belongs in `CHANGELOG.md` only.

| Briefing | What a project must do |
| --- | --- |
| [core-001 — config layering, overlays, opt-out](core-001-config-layering.md) | Move project-specific knip/ESLint config into the overlays; never recreate `knip.json`; use `governance/opt-out.json` for anything else pinned. |
| [core-002 — version bumps follow the change](core-002-versioning-per-change.md) | Bump SemVer on every landing change (`npm version <x> --no-git-tag-version`); never tag/release unprompted; simplify the `version` hook in your `package.json`. |
| [core-003 — governance is layered](core-003-governance-layers.md) | Keep your upstream as it is — do NOT repoint it at althing, or you lose the app layer. No `governance/config.json` needed. New gate: dead `ADR-NNN`/`rule:<slug>` citations now fail. |
| [core-004 — ADR ids carry their layer](core-004-layered-adr-ids.md) | Rename your project ADRs to `proj-NNN-*.md` / `ADR-PROJ-NNN` and fix every citation; a bare `ADR-NNN` no longer resolves and fails the gate. |
| [core-005 — decline an upstream decision](core-005-cross-layer-supersession.md) | Retire an upstream ADR/rule by declaring `supersedes` in YOUR document; never edit theirs. An opt-out no longer changes a document's layer. |
| [core-006 — no push-triggered CI](core-006-no-push-ci.md) | Delete your push-/PR-triggered `check:all` workflow; keep the tag-triggered release build. Verification is local, and that is the whole gate. |
| [core-007 — no entry point dies silently](core-007-crash-handling.md) | Give every entry point a last-resort handler (log, tell the user, record on device, exit deliberately). Own a stack layer? Publish the mechanism **and** a gate. |
| [core-008 — briefings carry their layer](core-008-layered-briefing-names.md) | Rename your own briefings to `<layer>-NNN-<slug>.md` (`app-…`, `proj-…`); a bare `NNN-…md` now fails the gate. Never reintroduce number ranges. |
