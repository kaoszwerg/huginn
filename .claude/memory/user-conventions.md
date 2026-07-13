---
id: mem:user-conventions
title: Maintainer conventions
tldr: "Code/comments/commits in English; Conventional Commits; best-solution-only and verify-first are hard rules; everything built in one pass, no stubs/optional."
scope: governance
load: core
type: feedback
---

# Maintainer conventions

- **Language:** code, comments, identifiers and commit messages in English. Conversational replies
  to the maintainer are in German.
- **Commits:** Conventional Commits, enforced by commitlint (ADR-CORE-008).
- **Quality bar:** the best solution, never the easiest; no shortcuts; production-grade from the
  first commit (ADR-CORE-002).
- **Evidence:** every claim/decision must be verified and provable; no assumptions (ADR-CORE-004).
- **Completeness:** implement in one pass — no stubs, no "later", nothing left "optional";
  half-finished work is rejected. (Stub ADRs for unstarted phases are explicitly allowed and
  marked `status: proposed`.)
- **Stability:** only current stable dependencies, versions verified before use (ADR-CORE-009).

**Why:** These are explicit, repeated maintainer requirements; violating them creates the technical
debt and misunderstandings they want eliminated.

**How to apply:** Treat each bullet as a gate on every change. If a constraint cannot be met, stop
and surface it as "open" rather than working around it.
