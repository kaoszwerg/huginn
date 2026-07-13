---
id: rule:git-workflow
title: Git workflow & branch authority
tldr: "The maintainer alone decides branches: the agent never creates, switches, merges or deletes one without explicit instruction; no force-push, no --no-verify."
scope: governance
load: core
triggers: [git, branch, checkout, merge, rebase, push, commit, worktree, workflow]
applies-to: []
---

# Git workflow & branch authority

- **Branch authority is the maintainer's alone.** The agent never creates, switches, renames, merges,
  rebases or deletes a git branch — and never changes the branch a build or PR targets — **without an
  explicit instruction from the maintainer**. When a task would need a branch (e.g. a commit while on
  `main`), the agent **stops and asks**; it does not branch on its own initiative.
- **No history rewriting or destructive git ops** without an explicit instruction: no `push --force`,
  no history rewrite on shared branches, no `reset --hard` / `clean` that discards the maintainer's work.
- **Commit & push only when asked** (ADR-CORE-008, rule:editing-workflow): the agent does not commit or push
  unprompted, and never bypasses pre-commit with `--no-verify`.
