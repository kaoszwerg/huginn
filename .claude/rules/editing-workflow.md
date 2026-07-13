---
id: rule:editing-workflow
title: Editing workflow
tldr: "Each change ships code + tests + docs/ADR + green check:all as one Conventional Commit; run governance:sync after touching governance docs."
scope: governance
load: conditional
triggers: [workflow, commit, edit, change, pr]
applies-to: []
---

# Editing workflow (ADR-CORE-008)

- Treat a change as complete only when it includes: code, its tests, any docs/ADR updates, and a green
  `check:all`.
- Touched a governance doc (ADR/rule/memory)? run `npm run governance:sync`, then `governance:check`.
- One logical change per commit; **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`,
  `refactor:`, …). Pre-commit (husky/lint-staged) must pass — do not bypass with `--no-verify`.
- Never leave a half-finished or stubbed change behind (ADR-CORE-002).
