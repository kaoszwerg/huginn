#!/usr/bin/env bash
# SessionStart reminder (compact/resume): force a governance reload before any work (ADR-006).
# stdout from a SessionStart hook is injected into the model context.
cat <<'BANNER'
============================================================
 CONTEXT (RE)LOADED — reload governance BEFORE any other action:
   1. Read CLAUDE.md
   2. Read the TLDR indexes:
        docs/adr/manifest.json
        .claude/rules/INDEX.md
        .claude/memory/MEMORY.md
   3. Load full ADRs/rules on demand:
        node scripts/context-for.mjs "<keywords>" <files...>
 Do NOT continue on a half-erased ruleset.
============================================================
BANNER
