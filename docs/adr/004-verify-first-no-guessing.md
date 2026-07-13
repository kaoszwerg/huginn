---
id: ADR-004
title: Verify first, never guess — every claim must be provable
status: accepted
tldr: "Every claim must be verified and provable (source/test/measurement); no guessing; unverified items are marked 'open', never asserted as fact."
scope: global
load: core
triggers: [verify, proof, evidence, assumption, version, api]
applies-to: []
supersedes: []
superseded-by: null
---

## Context

Unverified assertions (guessed API shapes, package versions, behaviours) are a primary source of bugs
and wasted work, and they erode trust in the docs.

## Decision

**Every** statement and decision must be verified, provable and evidenced — by a source, a test, a
measurement, or a direct quote from the data/code. No assumptions, no crystal-ball claims, **no
shortcuts**. Anything not yet verified is explicitly marked "open / unverified" and never presented as
fact. This holds for code, dependency versions, APIs, documentation and ADRs alike. Concretely:
package versions are checked against crates.io / npm before use; behaviour claims are backed by a test
or by the command output that demonstrates them; data-shape claims come from the real payload.

## Alternatives

- **Assume-and-fix-later** — rejected: produces confidently wrong code and misleading docs.

## Consequences

- Slightly slower authoring, dramatically fewer wrong assertions.
- Reviews can demand the evidence behind any claim.

## References

- ADR-010 (testing/golden), ADR-009 (dependency verification), `.claude/rules/no-guessing.md`,
  `.claude/rules/verification.md`.
