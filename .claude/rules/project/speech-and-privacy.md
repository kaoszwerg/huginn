---
id: rule:speech-and-privacy
title: Speech pipeline & the privacy boundary
tldr: "Inference runs in a deprivileged worker, never in the process holding the mic and keyboard. Audio and recognised text never reach a log, a file or the network."
scope: architecture
load: core
triggers:
  [
    speech,
    asr,
    stt,
    whisper,
    transcribe,
    transcription,
    audio,
    microphone,
    mic,
    record,
    recording,
    vad,
    worker,
    sidecar,
    privacy,
    telemetry,
    egress,
    network,
    log,
    redaction,
  ]
applies-to: ["src-tauri/**", "src/**"]
---

# Speech pipeline & the privacy boundary (ADR-PROJ-005, ADR-PROJ-006, ADR-PROJ-007)

This rule is `load: core` on purpose. It is the product's whole proposition, and every one of these lines
is a thing that would destroy it.

## The hard boundaries

- **Audio never leaves the device. Recognised text never leaves the device.** Not to a server, not to a
  crash report, not to telemetry, not "just for diagnostics". There is no flag that turns this off,
  because there is no such flag to write.
- **Never log the text.** Not at `debug`, not temporarily, not in a job label, not in an error message.
  A log containing transcripts is a verbatim record of everything the user has ever said. Log durations,
  byte counts, character *counts*, model ids, errors with context — never content (ADR-PROJ-007).
- **No recording without an explicit user action.** Push-to-talk: capture runs while the hotkey is held.
  No wake word, no always-listening, no "helpful" auto-start.
- **Exactly one outbound activity exists in this product**: a model download the user clicked
  (ADR-PROJ-006). Anything else that opens a socket is a defect and needs its own ADR *before* it exists.
- **Audio buffers are dropped as soon as the transcription is done.** Nothing is written to disk. A
  "keep the last recording" feature does not exist and is not to be added without the maintainer deciding
  it explicitly.

## The process boundary

- **Inference runs in `huginn-asr-worker`, a separate OS process** — no keyboard, no network, no
  filesystem beyond the model file. The main process holds the microphone, synthesises keystrokes and (on
  macOS) has accessibility rights; it must **never** be the process that parses a model file with C++
  code, least of all one the user brought themselves.
- **Do not "optimise" the boundary away.** In-process inference is faster to write and is the single
  worst change anyone could make to this codebase. If it ever looks necessary, stop and ask
  (ADR-CORE-002).
- **The protocol (`huginn-asr-proto`) is pinned by tests on both sides.** A reworded message may not
  silently break its consumer (rule:testing).
- **The worker is supervised**: a crash is logged with context, surfaced to the user, and the worker is
  restarted. Never swallowed (rule:logging).

## Engines and models

- The engine sits behind the `SpeechEngine` trait. whisper.cpp is the first implementation; the choice is
  settled by a **benchmark on German audio**, not by reputation (ADR-CORE-004).
- Models are **data** and are verified against a compiled-in SHA-256. **Code is never downloaded** — GPU
  backends are shipped (ADR-PROJ-006).
- A user-imported model is unverifiable, and the UI must say so. It is never labelled "verified".
