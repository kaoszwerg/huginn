---
id: rule:jobs
title: Jobs & the process monitor
tldr: "Anything over ~200 ms is a Job: async, with progress, an ETA and a cancel. State lives in the backend; the registry is also the one place that logs."
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
    await,
    background,
    task,
    thread,
    spawn,
    cancel,
    spinner,
    loading,
    footer,
    monitor,
    blocking,
    freeze,
  ]
applies-to: ["src-tauri/crates/huginn-core/**", "src-tauri/src/**", "src/components/**", "src/stores/**"]
---

# Jobs & the process monitor (ADR-PROJ-008)

- **Over ~200 ms → it is a Job.** Downloading, hashing, loading a model, transcribing, starting the
  worker, scanning devices. If you are about to `await` something slow and *not* register a job, you are
  about to make the app look dead. There is no "this one is quick enough".
- **Never block.** Not the UI thread, not the IPC handler. Long work runs on a task/thread and reports
  through the registry.
- **A Job carries:** id, kind, label, state (queued/running/succeeded/failed/cancelled), progress
  (done/total, or explicitly indeterminate), started_at, eta, cancellable, error.
- **The ETA is honest or absent.** Bytes/second, throughput, a measured real-time factor. If you cannot
  compute one, mark the job indeterminate — do **not** invent a number.
- **What is shown can be stopped.** Every job that can be cancelled, is — and cancelling actually stops
  the work, it does not just hide the row.
- **State lives in Rust, not in the window.** Huginn keeps running in the tray; closing the window must
  not kill a download, and reopening must show it unchanged.
- **Events, not polling** — coalesced and rate-limited. A 3 GB download does not get to emit an event per
  chunk.
- **The `Job` type is generated** from Rust via `ts-rs` (`npm run gen:types`) and imported by TypeScript.
  Never retyped by hand on the frontend (ADR-CORE-005).
- **Log at the registry, not at the call site.** Every transition is logged there once, structured
  (rule:logging). Never log the recognised text — not even in a job label (ADR-PROJ-007).
- **The ASR worker process is not a Job.** It is a real OS process with its own row in the monitor
  (running / starting / crashed / restarting).
