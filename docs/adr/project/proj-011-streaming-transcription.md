---
id: ADR-PROJ-011
title: Streaming transcription — insert while speaking, bounded memory
status: accepted
tldr: "Transcribe while speaking, in silence-cut segments inserted as ready; the key-release does the final tail; falls back to batch when there is no pause."
scope: architecture
load: conditional
triggers:
  [
    streaming,
    stream,
    segment,
    chunk,
    silence,
    vad,
    latency,
    transcribe,
    transcription,
    incremental,
    pump,
    real-time,
    buffer,
    memory,
  ]
applies-to:
  ["src-tauri/crates/huginn-audio/**", "src-tauri/src/speech/**", "src-tauri/src/pushtotalk/**"]
---

# Streaming transcription (ADR-PROJ-011)

## Context

Push-to-talk was **batch**: the whole recording was transcribed only after the key was released. On CPU
whisper the real-time factor is below 1 (measured ~0.3 for `ggml-base` on the maintainer's machine), so a
20-second dictation meant 20+ seconds of the user staring at "Ich höre zu …" with nothing happening — and a
long clip could grow memory and, on `ggml-small`, crash the worker outright. For a background dictation tool
that should be "kaum bemerkbar", that is unusable.

## Decision

Transcribe **while the user is still speaking**, in silence-bounded segments, and insert each segment's text
the moment it is ready. The design keeps three properties that make it never worse than the batch it replaces:

1. **The recorder's buffer *is* the un-transcribed audio.** A segment that has been transcribed is
   **removed** from the buffer (`Recorder::take_segment`), so memory is bounded by how far transcription lags
   behind speech — not by the whole dictation. A ten-minute cap still backstops a stuck key (unchanged).
2. **Cuts happen only at silence.** A driver polls the buffer, and `find_silence_cut` returns a cut point
   only after enough speech has accumulated **and** the recent tail is quiet — so a word is never sliced in
   half. A `MAX_SEGMENT` length forces a cut for a continuous talker (bounding latency and memory), chosen at
   the quietest point in the tail.
3. **It degrades to batch.** If no silence is ever found (one long unbroken utterance under the max), nothing
   is cut and the key-release transcribes the whole tail exactly as before. Streaming is an accelerator, not
   a replacement of the guarantee.

Each segment is resampled to 16 kHz mono, transcribed by the **same** deprivileged worker over the **same**
protocol (one `Transcribe` per segment — no protocol change, ADR-PROJ-005 intact), post-processed by
`huginn-text` (spacing, spoken commands, macros) and injected. Segments are processed **sequentially** by one
driver thread, so there is no reordering and no second worker.

The overlay states from ADR-PROJ-004 carry over: "listening" (meter live) while recording, "working" while a
segment transcribes, and on release the final tail then "inserted"/"not recognised".

## What this is not

- **Not word-level streaming with overlapping windows.** whisper.cpp is a batch recogniser; re-transcribing
  a sliding window and reconciling stable prefixes is a research problem and a duplication risk. Silence
  segmentation gets most of the perceived-latency win with none of that risk.
- **Not a fix for whisper's raw speed.** A model that runs below real-time still runs below real-time;
  streaming makes the *wait* disappear behind the speaking, and bounds memory, but the throughput ceiling is
  the model's. A smaller/quantised model is a separate lever (ADR-PROJ-006), not this ADR.

## Consequences

- `huginn-audio` gains `Recorder::take_segment` and the pure `find_silence_cut`; the batch `finish()` and the
  level meter are unchanged and still used (the final tail, the overlay).
- The Windows push-to-talk driver replaces the level-only pump with a streaming pump that also cuts,
  transcribes and injects. The macOS half (phase 1b) inherits the cross-platform speech orchestration.
- Per-segment `huginn-text`: a macro whose trigger phrase straddles a silence cut will not fire. Accepted for
  v1 — commands and macros are short and rarely span a pause; the batch path (no cut) still handles them.
