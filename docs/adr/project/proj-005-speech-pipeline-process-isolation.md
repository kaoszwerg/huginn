---
id: ADR-PROJ-005
title: Speech pipeline — whisper.cpp behind a trait, in a separate deprivileged worker process
status: accepted
tldr: "Inference runs in a separate deprivileged worker: the process holding the mic, the keyboard and accessibility rights must never be the one parsing a model file."
scope: architecture
load: conditional
triggers:
  [
    speech,
    asr,
    stt,
    whisper,
    transcription,
    audio,
    microphone,
    vad,
    worker,
    sidecar,
    process,
    isolation,
    sandbox,
    ggml,
    gguf,
  ]
applies-to: ["src-tauri/crates/huginn-asr*/**", "src-tauri/crates/huginn-audio/**"]
supersedes: []
superseded-by: null
---

## Context

Huginn's main process is, by necessity, one of the most privileged things on the user's machine: it
holds the **microphone**, it **synthesises keystrokes** into other applications, and on macOS it holds
**accessibility** rights. That is the price of the product.

It is also, in the naive design, the process that parses a **GGUF model file with C++ code** (ggml /
whisper.cpp). And the user is explicitly allowed to bring their **own** model file (ADR-PROJ-006), whose
integrity nobody can verify. A memory-safety bug in that parser, reached by a crafted model, would hand
an attacker the microphone and the ability to type into the user's session. There is no more valuable
target to hand out in a dictation app.

Engine choice: whisper.cpp (via Rust bindings) has the strongest German quality of the realistic
candidates and maps naturally onto push-to-talk (transcribe on release; no streaming needed). Streaming
engines (sherpa-onnx) buy live partial text at the cost of German accuracy. This is not settled by
reputation — it is settled by a benchmark on German material, which is the first task of the speech work.

## Decision

- **Inference runs in a separate OS process.** `huginn-asr-worker` is a Tauri **sidecar** binary. It
  receives audio frames over a pipe and returns text. It has **no** keyboard access, **no** network, and
  **no** filesystem access beyond the model file it was told to open. If the parser falls, a process that
  can do nothing falls with it.
- **The boundary is a pinned contract.** `huginn-asr-proto` defines the wire protocol, and it is tested
  from **both** sides (rule:testing) — a reworded message may not silently break the consumer.
- **The engine sits behind a trait.** `huginn-asr` exposes `SpeechEngine`; whisper.cpp is the first
  implementation. Swapping in a streaming engine later must not touch the app.
- **The engine is chosen by measurement, not by reputation.** The first speech task benchmarks the
  candidates on German test audio (WER **and** latency, on the maintainer's hardware) and the result is
  recorded here.
- **The worker is supervised.** It is started lazily, its liveness is watched, a crash is logged with
  context and surfaced to the user (never swallowed), and it is restarted. Its state is visible in the
  process monitor (ADR-PROJ-008).
- **GPU backends are compiled in or shipped — never downloaded.** Downloading a model is downloading
  *data*; downloading a backend would be downloading *code* (ADR-PROJ-006).
- **The recognised text is never logged**, at any level (ADR-PROJ-007).

## Alternatives

- **Everything in one process** — rejected: it puts a C++ parser, fed by a file the user may supply, in
  the process that owns the microphone and the keyboard. That is the entire threat model in one sentence.
  A process boundary is drawn at the start or never; retrofitting one is a rewrite.
- **Sandboxing in-process** (seccomp/AppContainer/etc.) — rejected: not portable across Windows and
  macOS, and it does not remove the capabilities the main process legitimately needs elsewhere.
- **Refusing user-supplied models** — rejected: it would close a legitimate need (an offline machine, an
  own model) to avoid a problem the process boundary solves anyway.

## Consequences

- A process boundary, a wire protocol, a lifecycle and a supervisor — real complexity, taken on
  deliberately.
- Startup cost per session (the worker loads the model). Mitigated by keeping the worker warm between
  dictations and by making the load a visible Job.
- A user-supplied model is never reported as "verified"; the UI says plainly that its integrity is
  unknown, because it is.

## References

- ADR-PROJ-006 (models), ADR-PROJ-007 (storage & logging), ADR-PROJ-008 (jobs), ADR-CORE-011 (security by
  design), rule:speech-and-privacy.
