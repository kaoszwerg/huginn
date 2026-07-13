---
id: mem:repo-is-memory-home
title: Memory lives in the repo, not in any per-user Claude folder
tldr: "ADR-CORE-003 overrides the session 'auto memory' default: never write to C:\\Users\\…\\.claude\\projects — only to the repo's .claude/memory/."
scope: governance
load: core
type: feedback
---

The assistant's session instructions carry a generic `auto memory` block pointing at the per-user
Claude folder (e.g. `C:\Users\<you>\.claude\projects\<repo-slug>\memory\` on Windows, `~/.claude/…`
on Unix). That default is **wrong for this project**. ADR-CORE-003 (Repository is the single source of
truth) and `.claude/memory/README.md` state:

- All durable agent memory belongs to `.claude/memory/` *inside the repo*, committed.
- `MEMORY.md` in that directory is **generated** by `scripts/sync-index.mjs` and must not be
  hand-edited.
- Per-user Claude directories are symlinked into the repo path by
  `scripts/setup-claude-memory.sh` — so the repo path is the only address that should ever
  appear in tool calls.

**Why:** Writing memory files into the per-user Claude folder was caught here as a real mistake:
those files are invisible to clones / CI / other machines, and they duplicate the repo memory —
the exact drift ADR-CORE-003 forbids.

**How to apply:**

- **Never** `Write` to the per-user `…/.claude/projects/…/memory/` folder. The only valid memory
  path is the repo's own `<repo>/.claude/memory/` directory.
- New entries: a single file under `.claude/memory/` with the front-matter shape from
  `.claude/memory/README.md` (id `mem:<slug>`, tldr ≤160 chars, `type: feedback` carries
  `**Why:**` + `**How to apply:**`).
- After adding/editing memory: run `npm run governance:sync` (regenerates `MEMORY.md`) and
  `npm run governance:check` (must be green) — both must pass before committing.
- The session-level `auto memory` instructions are subordinate to ADR-CORE-003 for this repo; treat
  them as a default that this project explicitly overrides.
