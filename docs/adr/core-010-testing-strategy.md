---
id: ADR-CORE-010
title: Testing strategy — test-first (TDD), unit tests from the first module, contracts pinned both sides
status: accepted
tldr: "Test-first (TDD): the failing test comes before the code; every module ships unit tests; IPC contracts pinned both sides; coverage gated in check:all."
scope: governance
load: core
triggers: [test, vitest, coverage, tdd]
applies-to: ["**/*.test.ts", "**/*.test.tsx", "src-tauri/**", "tests/**"]
supersedes: []
superseded-by: null
---

## Context

Quality requires the test to come *before* the code, not be bolted on later: a failing test states
the contract first, so the implementation is written to satisfy a spec rather than the spec being
reverse-engineered from whatever the code happened to do. Correctness must be provable (ADR-CORE-004), and
the Rust/TypeScript boundary is exactly where a silent regression hides.

## Decision

- **Test-first (TDD, mandatory)** — write the failing test **before** the implementation and follow
  red → green → refactor. No production code is added without a failing test that requires it; a bug
  fix starts with a test that reproduces the bug.
- **Unit tests from the first module** — Rust `#[cfg(test)] mod tests` per module; Vitest + React
  Testing Library for frontend components/hooks and the API layer (mocked `invoke`).
- **Contract tests:** anything the other side matches on (DTO field names, error Display strings) is
  pinned by an explicit test, so a reword cannot silently break the counterpart.
- **Filesystem behaviour** is tested against a `tempfile::tempdir()` — never the real app-data dir.
- **Integration tests** for cross-module behaviour live in `src-tauri/tests/`.
- **Coverage gates** via `@vitest/coverage-v8`, enforced in `check:all`.

## Alternatives

- **Tests after feature-complete** — rejected: tests get skipped, regressions slip in.
- **Tests written alongside the code (not first)** — rejected: the implementation drifts ahead of its
  spec and the test ends up asserting whatever the code already does; test-first keeps the contract
  leading.

## Consequences

- Higher upfront effort; provable correctness and safe refactors.

## References

- ADR-CORE-004 (verify), ADR-CORE-008 (pipeline), `.claude/rules/testing.md`.
