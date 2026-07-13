---
id: rule:testing
title: Testing
tldr: "Test-first (TDD): the failing test comes before the code; unit tests per module, contracts pinned both sides, filesystem work in a temp dir; coverage gated."
scope: global
load: conditional
triggers: [test, testing, coverage, fixture, tdd, unit, integration, contract]
applies-to: []
---

# Testing (ADR-CORE-010)

- **Test-first (TDD):** write the failing test **before** the code and follow red → green → refactor.
  No production code without a failing test that demands it; **a fix begins with a test that reproduces
  the bug**. Tests are never deferred to a follow-up change — they ship in the same change as the code.
- **Unit tests live with the module.** Every module carries its own tests; behaviour that crosses a
  module boundary gets an integration test.
- **Contracts are pinned on both sides.** Anything one side matches on — an error message the UI keys
  off, a field name in a payload — is pinned by a test on the side that produces it, so a reword cannot
  silently break the consumer.
- **Filesystem work is tested against a temporary directory**, never the real user/app data location. A
  test that can corrupt the developer's state is a defect.
- **Query behaviour, not implementation.** A test asserts what a user or caller observes, not the
  internal structure that happens to produce it.
- **Coverage is gated** in `check:all`.
- **The gate itself is tested.** A script that guards every commit (a drift gate, a sync script) gets the
  same treatment as production code — it runs against a temp fixture, not against the live repo.

**Which runner, which assertion library, which `#[cfg(test)]`-equivalent** belongs to the stack's own
layer; that a failing test comes first does not.
