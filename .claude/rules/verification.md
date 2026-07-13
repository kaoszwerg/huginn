---
id: rule:verification
title: Verification
tldr: "Prove correctness: tests per module, exercise the real thing end-to-end, show the evidence (command + output); check:all green before declaring done."
scope: global
load: conditional
triggers: [verify, proof, evidence, check, done, prove]
applies-to: []
---

# Verification (ADR-004, ADR-010)

- **Logic:** unit tests per module; integration tests for anything that crosses a module boundary.
  Filesystem behaviour is verified against a temp directory — never asserted from reading the code.
- **Boundary:** a contract two sides depend on (a payload shape, an error string a UI matches on) is
  covered by tests on **both** sides.
- **End-to-end:** run the real thing — start the application/entry point, drive the affected path, and
  confirm the behaviour *and* the output it produces. A passing unit test is not a demonstration that the
  feature works.
- **Gate:** `npm run check:all` green locally (and in CI) before declaring anything done.
- **Show the evidence.** Paste the command and its output rather than asserting success. "It works" is
  not a verification; a terminal transcript is (rule:response-format).
- **Reachability is verified too.** A rule, ADR or gate you added is proven to reach the next agent by
  running the lookup that agent would run (`node scripts/context-for.mjs …`) and showing the result
  (rule:knowledge-handover).
