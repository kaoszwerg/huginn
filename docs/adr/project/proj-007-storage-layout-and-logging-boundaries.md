---
id: ADR-PROJ-007
title: Storage layout, lowercase paths — and the text is never written to a log
status: accepted
tldr: "Lowercase huginn/ directories via the platform API, named after the product, not the provisional identifier. Recognised text is never written to a log."
scope: architecture
load: conditional
triggers:
  [
    path,
    paths,
    directory,
    appdata,
    storage,
    config,
    logs,
    logging,
    cache,
    models,
    filesystem,
    backup,
    redaction,
  ]
applies-to: ["src-tauri/crates/huginn-platform/**", "src-tauri/crates/huginn-core/**"]
supersedes: []
superseded-by: null
---

## Context

Two independent questions, decided together because both are permanent once a user has installed the app.

**Where things live.** Tauri derives the app-data directory from the bundle identifier by default — which
would give `ai.lysis.huginn/`. But the identifier is **provisional** (ADR-PROJ-002): the publisher is
undecided. If the user's configuration and their multi-gigabyte model live in a directory named after the
identifier, changing the publisher orphans both.

**What goes into the log.** Huginn transcribes everything its user says. A log that contains the
recognised text is a **verbatim record of everything the user has ever dictated** — passwords read aloud,
medical notes, private messages. `rule:logging` already forbids logging user content; in this product it
is not a style rule, it is the difference between the promise and its opposite.

## Decision

**Paths — named after the product, lowercase, resolved through the platform API.**

| | Windows | macOS |
| --- | --- | --- |
| Config | `%APPDATA%\huginn\huginn.toml` (roaming — settings follow the user) | `~/Library/Application Support/huginn/huginn.toml` |
| Models | `%LOCALAPPDATA%\huginn\models\` (local — a 3 GB model must never roam) | `~/Library/Application Support/huginn/models/` |
| Logs | `%LOCALAPPDATA%\huginn\logs\huginn.log` | `~/Library/Logs/huginn/huginn.log` |
| Cache | `%LOCALAPPDATA%\huginn\cache\` | `~/Library/Caches/huginn/` |

- **Lowercase throughout**, matching `huginn.toml`, `huginn.log`, `huginn-diagnostics.json`. (The product
  brief writes `Huginn/`; the brief is corrected, not the code.)
- **Named `huginn`, not after the identifier** — so the user's data survives the publisher decision.
- **Resolved through the platform API**, never relative to the executable. Huginn writes nothing next to
  its own binary (rule:security).
- **The models directory is excluded from backup on macOS** (`NSURLIsExcludedFromBackupKey`). A model is
  large and perfectly reproducible; it has no business in Time Machine or iCloud. On Windows,
  `%LOCALAPPDATA%` is already outside the roaming profile.
- **Any user-supplied path is canonicalised and checked against an allowed root** before it is touched.

**Logging — what is recorded, and what may never be.**

- **Never**: the recognised text, audio samples, the clipboard, window titles or the name of the
  application being typed into. Not at `debug`. Not "temporarily". Not behind a flag.
- **Always**: the lifecycle and the numbers — job start/progress/result, durations, byte counts,
  character *counts*, model id, device id, error with context. Enough to debug a failure; never enough to
  reconstruct what was said.
- **One chokepoint**: the Job registry logs every state transition once (ADR-PROJ-008), instead of fifty
  call sites logging what they feel like. What the process monitor shows, the log has.
- Logs are size-capped and rotated. A dictation tool that fills a disk is a defect.

## Alternatives

- **Directories named after the bundle identifier** (Tauri's default) — rejected: it welds the user's data
  to a decision that is explicitly still open.
- **`Huginn/` with a capital H** (as in the brief) — rejected on the maintainer's instruction; consistency
  with the file names wins, and the brief is corrected to match.
- **An opt-in "debug transcript" log** — rejected. It is the one feature whose existence would make every
  privacy claim conditional, and the moment it exists, someone will ship it enabled.

## Consequences

- A publisher change costs the user their macOS permission grants (keyed to the identifier by the OS) but
  **not** their settings and **not** their models.
- Debugging a bad transcription cannot be done from the log alone. That is the intended trade: the user
  can reproduce it with a file they choose to share, and the product does not keep a diary of their life.

## References

- ADR-PROJ-002 (provisional identity), ADR-PROJ-006 (models), ADR-PROJ-008 (jobs / the logging
  chokepoint), ADR-CORE-011, rule:logging, rule:privacy, rule:security, mem:logging-contract.
