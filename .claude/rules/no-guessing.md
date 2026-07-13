---
id: rule:no-guessing
title: No guessing
tldr: "Never invent APIs, versions, file shapes or behaviours; read the actual source/schema/data first, verify a version against its registry, cite what you claim."
scope: global
load: conditional
triggers: [guess, assume, api, version, unknown, invent, hallucination]
applies-to: []
---

# No guessing (ADR-004)

- **Do not invent an interface.** Function signatures, config keys, payload shapes, CLI flags — read the
  actual source, schema or sample data before you use them. A plausible name is not a verified one.
- **Do not write a dependency version from memory.** Verify it against the package registry that serves
  it, then pin it (rule:dependencies).
- **Do not claim a behaviour without a test, a run, or a citation.** "It should work" is not a finding.
- **If a fact cannot be verified now, mark it "open"** and either verify it or leave it out — never
  assert it as fact (rule:response-format).

This rule forbids inventing **facts**. Inventing **decisions** is forbidden separately: when intent,
scope or approach is ambiguous, ask the maintainer rather than picking for them (rule:clarify-and-plan).
