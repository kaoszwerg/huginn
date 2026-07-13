---
id: rule:logging
title: Logging & observability
tldr: "Every component logs action + result through one structured logger; log the lifecycle and every error with context; never log secrets; no silent failures."
scope: global
load: conditional
triggers: [logging, observability, error, debug, logs, structured, levels]
applies-to: []
---

# Logging & observability

Detailed, structured logging is **mandatory across all components** — it is the primary debugging tool
and a core principle (rule:core-principles §7).

- **One structured logger, never an ad-hoc print.** Log with structured fields (request id, file,
  counts, durations), not string-concatenated prose.
- **Every component logs.** Each command, request handler and long-running background task logs the
  action it performs **and its result**. No component is silent. New code brings its logging in the same
  change — never "added later".
- **Log the lifecycle:** operation start, progress, result — and every error with the context needed to
  act on it.
- **No silent failures.** Every caught error is logged *and* surfaced (returned to the caller, shown to
  the user, or recorded). Swallowing an error is a defect, not a style choice.
- **Never log secrets** (credentials, tokens) or user content (ADR-011, rule:privacy).
- **Levels:** `error` for failures, `warn` for recoverable anomalies (an unexpected but handled input),
  `info` for lifecycle, `debug` for detail. Default level in a release build: `info`.
- **One chokepoint beats N call sites.** Where errors cross a boundary (IPC, HTTP, a queue), log them
  once at the serialisation point rather than at every caller — a single place that cannot be forgotten,
  and cannot be bypassed.

**The mechanism belongs to the stack.** *Which* logger, which sinks, where the file goes and how a UI
reads it are decided by the app/stack layer that owns the runtime — this rule is the obligation, that
layer's ADR is the implementation. Load it alongside this rule when you touch logging code.
