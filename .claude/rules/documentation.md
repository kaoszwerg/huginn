---
id: rule:documentation
title: Code documentation standard
tldr: "Every exported boundary item carries a doc comment (purpose, inputs/outputs, failure modes); comments explain intent, not mechanics; docs travel with code."
scope: global
load: conditional
triggers: [doc, documentation, comment, docstring, api-docs]
applies-to: []
---

# Code documentation standard

- **Document the public surface.** Every exported boundary item — a command, a public type, an exported
  component, hook or utility — carries a doc comment in whatever form its language provides. State what
  it does, its inputs and outputs, and its **failure modes** — not how it is implemented.
- **Comments explain intent, not mechanics.** Comment the *why*: a non-obvious constraint, an invariant,
  a boundary contract, the reason the obvious approach does not work. Never restate what the code plainly
  says. No commented-out code (rule:code-quality).
- **Docs travel with the code.** A signature or behaviour change updates its doc comment in the **same**
  change (ADR-003). A stale doc comment is a defect, not cosmetics — it is worse than no comment, because
  it is trusted.
