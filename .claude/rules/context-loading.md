---
id: rule:context-loading
title: Context loading contract
tldr: "Boot: CLAUDE.md + TLDR indexes + core docs only. Per task: load full docs whose tldr/triggers/applies-to match (or via context-for.mjs). Reload after compact."
scope: governance
load: core
triggers: [context, loading, tldr, manifest, compact, resume]
applies-to: [".claude/**", "docs/adr/**"]
---

# Context loading contract (operational form of ADR-CORE-006)

1. **Boot:** read `CLAUDE.md`; then `docs/adr/manifest.json`, `.claude/rules/INDEX.md`,
   `.claude/memory/MEMORY.md` (TLDRs only); then the full text of every `load: core` document.
2. **Per task:** identify keywords + files you will touch. Load the full text of a `conditional`
   document **iff** its `tldr`, `triggers`, or `applies-to` globs match. Unsure? run
   `node scripts/context-for.mjs "<keywords>" <files...>` and read exactly what it lists.
3. **Never** auto-load `archival` documents.
4. **After compact/resume:** the hook prints a reminder — re-read `CLAUDE.md` + the indexes, then
   re-resolve step 2 before continuing.

Do not pin documents you are not actively using; the index TLDRs are enough to decide.
