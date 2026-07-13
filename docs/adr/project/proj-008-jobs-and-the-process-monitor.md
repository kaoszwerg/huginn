---
id: ADR-PROJ-008
title: Every long operation is a Job — asynchronous, observable, cancellable — and the footer shows them
status: accepted
tldr: "Nothing over ~200 ms runs invisibly: a Job has progress, an ETA and a cancel, lives in the backend, and its registry is also the single logging chokepoint."
scope: architecture
load: conditional
triggers:
  [
    job,
    jobs,
    progress,
    percent,
    eta,
    async,
    background,
    task,
    queue,
    cancel,
    spinner,
    footer,
    monitor,
    status,
    blocking,
  ]
applies-to: ["src-tauri/crates/huginn-core/**", "src/components/**", "src/stores/**"]
supersedes: []
superseded-by: null
---

## Context

Huginn does several things that take real time: downloading a multi-gigabyte model, hashing it, loading
it into memory, transcribing, starting the worker. Any of them done synchronously freezes the UI; any of
them done silently leaves the user staring at an application that appears to have died.

The maintainer's requirement is a **process monitor in the footer**: what is running, what it is doing,
how long it still needs — with percentages for downloads and comparable detail for everything else.

Read as an architecture requirement rather than a widget request, it says: **no operation longer than
roughly 200 ms may happen invisibly.** That is a contract the backend has to honour, and a footer is
merely where it becomes visible.

## Decision

- **A Job is the unit.** Every operation over ~200 ms is one: `id`, `kind`, `label`, `state`
  (queued / running / succeeded / failed / cancelled), `progress` (determinate — done/total in bytes or
  seconds — or explicitly indeterminate), `started_at`, `eta`, `cancellable`, `error`. Nothing long-running
  bypasses the registry; that is the rule, not the aspiration.
- **The state lives in the backend.** The window is a view. Closing it (Huginn keeps running in the tray)
  does not touch a running job; reopening shows it unchanged. A download must not die because someone shut
  a window.
- **Events, not polling.** The registry pushes changes to the frontend, coalesced and rate-limited, so a
  download cannot emit ten thousand events per second.
- **The type is generated, not retyped.** `Job` is defined once in Rust (`ts-rs`) and imported by
  TypeScript via `npm run gen:types`. A boundary type is never hand-copied on both sides (ADR-CORE-005).
- **What is shown can be stopped.** Download, checksum, model load, transcription: all cancellable. A
  progress bar without a cancel button is a taunt.
- **The registry is the single logging chokepoint.** Every job transition — start, progress milestones,
  result, error with context — is logged there, once, structured. Not at fifty call sites (rule:logging:
  "one chokepoint beats N call sites"). What the footer shows, the log has; and neither ever contains the
  recognised text (ADR-PROJ-007).
- **An ETA is honest or absent.** Bytes/second for a download, throughput for a hash, a measured real-time
  factor for transcription. Where no honest estimate exists, the job is marked indeterminate — it does not
  invent a number.
- **The worker process is shown, but it is not a Job.** `huginn-asr-worker` is a real OS process
  (running / starting / crashed / restarting). It belongs in the monitor, on its own row.

## Alternatives

- **A spinner per feature** — rejected: it hides how long things take, has no cancel, and leaves the log
  and the UI telling different stories.
- **Frontend-held state** — rejected: jobs would die with the window, which is exactly the failure a
  background dictation tool must not have.
- **Polling from the frontend** — rejected: latency and waste, and it puts the "is anything running?"
  question in the wrong process.

## Consequences

- Every long-running feature costs a little more up front: it must report progress and honour a cancel.
  In exchange, the app is never mysteriously busy, and the log gets its structure for free.
- The footer is a real surface of the design system, not a debug panel (ADR-PROJ-003).

## References

- ADR-PROJ-005 (the worker), ADR-PROJ-006 (downloads), ADR-PROJ-007 (logging boundaries), ADR-CORE-005,
  rule:jobs, rule:logging.
