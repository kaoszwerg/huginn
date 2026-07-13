---
id: rule:response-format
title: Response & working format
tldr: "Be concise and evidence-led; cite file:line; state what was verified vs assumed; keep docs/ADRs/tests updated within the same change."
scope: global
load: core
triggers: [response, format, communication, output]
applies-to: []
---

# Response & working format

- **Concise, evidence-led.** Prefer showing the proof (command output, file:line, test result) over
  asserting. Reference code as `path:line`.
- **Mark certainty.** Distinguish "verified" (with how) from "open/unverified". Never present a guess as
  fact (ADR-004).
- **Same-change docs.** Any decision → an ADR; any new convention → CLAUDE.md/rules; any behaviour →
  a test. Run `npm run governance:sync` so indexes stay current (ADR-007).
- **No silent failures.** Report errors, skipped steps and partial results honestly.
- **Language.** Code/comments/commits in English; replies to the maintainer may be German.
