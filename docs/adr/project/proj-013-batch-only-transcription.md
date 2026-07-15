---
id: ADR-PROJ-013
title: Batch-only transcription — streaming removed
status: accepted
supersedes: [ADR-PROJ-011]
tldr: "Streaming removed: GPU made batch instant and fragmentation lost words at every cut. Transcribe the whole recording once; whisper handles any length."
scope: architecture
load: conditional
triggers:
  [
    streaming,
    stream,
    segment,
    chunk,
    silence,
    batch,
    transcribe,
    transcription,
    fragment,
    pump,
    latency,
    whole-recording,
  ]
applies-to:
  ["src-tauri/crates/huginn-audio/**", "src-tauri/src/speech/**", "src-tauri/src/pushtotalk/**"]
---

# Batch-only transcription (ADR-PROJ-013)

## Context

Streaming transcription (ADR-PROJ-011) existed for one reason: on the CPU, whisper ran slower than
real time, so a long dictation meant the user waiting seconds after they finished speaking. Streaming
hid that wait by cutting the recording into silence-bounded segments and transcribing each as the user
spoke.

Two things then made streaming not just unnecessary but **harmful**:

1. **GPU acceleration (ADR-PROJ-012) made batch instant.** A 5-second clip transcribes in ~0.15 s on the
   GPU (RTF 30–37). There is no wait left to hide.
2. **Streaming fragmentation loses words.** whisper is trained on 30-second windows and reaches its
   accuracy from context; a 2–3 second fragment transcribed in isolation drops words at both cut edges
   and reads worse than the same speech in one pass. **Measured** from the maintainer's install
   (2026-07-15): a 21.6-second dictation was cut into 8 fragments (4.0 / 2.1 / 2.4 / 1.5 / 2.4 / 3.4 / 3.3
   s + tail); the segments summed to the full duration — no audio was dropped — but the transcript was
   visibly incomplete, and got proportionally shorter the longer the user spoke. "The longer I speak, the
   shorter the result" was the fragmentation itself.

whisper.cpp's `whisper_full` already transcribes audio of **any** length correctly: it slides its
30-second window across the whole recording, carrying context between windows. Batch is therefore both
complete and — with the GPU — instant, for any dictation length.

## Decision

**Remove streaming entirely.** Every recording is transcribed **once**, on key-release, as a whole. The
maintainer decided the removal (ADR-CORE-002: a feature is removed only with the owner's consent).

Removed: the streaming pump's segmentation, `Recorder::take_silence_segment`, the pure `find_silence_cut`
and `silence_peak_for`, `speech::stream_segment`, the `streaming` / `stream_sensitivity` settings, their
`set_streaming` / `set_stream_sensitivity` commands and TS wrappers, and the Streaming panel in the
settings UI. The overlay's live input-level meter — which the streaming pump used to drive — is now driven
by a dedicated **level-only pump** (`start_level_pump`) that polls the level and pushes it to the overlay,
and does no transcription.

## Consequences

- **Complete, accurate transcripts** at any length: one `whisper_full` pass with full cross-window
  context, instead of many context-free fragments.
- **The key-up over-recording bug cannot recur.** ADR-PROJ-011's pump was joined on release *before* the
  microphone was stopped, so a slow in-flight segment kept the mic open (the earlier `stop_capture` fix
  addressed that). With no pump to join, `finish_recording` stops the microphone the instant the key is
  up — the failure mode is gone by construction, and `stop_capture` / `stop_capturing` are removed with it.
- **Simpler code, smaller surface:** no segmentation policy, no per-segment ordering guarantees, no
  sensitivity knob that silently degraded quality when a user turned it up.
- **A user whose settings still carried `streaming: true` is unaffected** — the fields are gone from the
  DTO, and unknown keys in an existing `settings.json` are ignored on load.
- If a future need for incremental output appears, it would call for a **streaming-native engine** behind
  the `SpeechEngine` trait (ADR-PROJ-005), not silence-fragmenting a batch recogniser.
