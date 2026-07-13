# Migration briefings

One file per core change that a **project** must know about or act on — written for the agent working
in a fork, not for a changelog reader. They are part of the pinned governance core (ADR-030), so
`npm run governance:update` delivers them into every project and prints the list at the end of a run.

- Name: `NNN-<slug>.md`, numbered in the order the changes landed in the template.
- Content: what changed, what a project must do, and what is now forbidden — concrete, with the exact
  commands and file names. State the mechanism the gate enforces, so an agent that ignores the briefing
  still hits a red `check:all` rather than a silent bypass (rule:knowledge-handover).
- Write one whenever a core change alters how a project must behave. A change no project has to act on
  belongs in `CHANGELOG.md` only.

| Briefing | What a project must do |
| --- | --- |
| [001 — config layering, overlays, opt-out](001-config-layering.md) | Move project-specific knip/ESLint config into the overlays; never recreate `knip.json`; use `governance/opt-out.json` for anything else pinned. |
| [002 — version bumps follow the change](002-versioning-per-change.md) | Bump SemVer on every landing change (`npm version <x> --no-git-tag-version`); never tag/release unprompted; simplify the `version` hook in your `package.json`. |
| [003 — governance is layered](003-governance-layers.md) | Keep your upstream as it is — do NOT repoint it at althing, or you lose the app layer. No `governance/config.json` needed. New gate: dead `ADR-NNN`/`rule:<slug>` citations now fail. |
