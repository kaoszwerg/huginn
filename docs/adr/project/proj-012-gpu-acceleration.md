---
id: ADR-PROJ-012
title: GPU acceleration for transcription — Vulkan and Metal behind the engine trait
status: accepted
tldr: "GPU acceleration behind the SpeechEngine trait: Vulkan on Windows/Linux, Metal on macOS; opt-in, shipped in the release worker only; CPU fallback if no device."
scope: architecture
load: conditional
triggers:
  [
    gpu,
    vulkan,
    metal,
    cuda,
    backend,
    acceleration,
    accelerate,
    whisper,
    performance,
    speed,
    slow,
    rtf,
    device,
    driver,
    sdk,
    feature,
    hipblas,
    coreml,
  ]
applies-to:
  [
    "src-tauri/crates/huginn-asr/**",
    "src-tauri/crates/huginn-asr-worker/**",
    "scripts/project/prepare-worker.mjs",
  ]
---

# GPU acceleration for transcription (ADR-PROJ-012)

## Context

whisper.cpp on the CPU is too slow to be "kaum bemerkbar". Measured on the maintainer's machine
(RTX 3070, release log 2026-07-15): **`ggml-small` takes ~24 s per transcription regardless of clip
length** — 1.86 s of audio and 24.74 s of audio both cost ~24 s. That is whisper's architecture:
inference runs over a **fixed 30-second window**, and anything shorter is padded to it, so a short
utterance pays the same encoder cost as a full window. `ggml-base` is ~3.4× faster (RTF 3.5) but still
CPU-bound.

Two consequences follow, both fatal to the product's "background app" promise:

- The per-utterance latency floor is the cost of one 30 s window — seconds on CPU, whatever the model.
- **Streaming cannot fix this** (ADR-PROJ-011 said so explicitly): cutting into segments multiplies the
  30 s-window cost rather than reducing it. Streaming hides the wait behind speaking; it does not raise
  the throughput ceiling. The ceiling is the engine's, and on CPU it is low.

The one lever that moves the ceiling is the compute backend. whisper.cpp runs the same model on a GPU,
where a 30 s window is a fraction of a second.

## Decision

Add **GPU acceleration behind the existing `SpeechEngine` trait** — an additional compute path for the
same whisper.cpp engine and the same models, never a rewrite and never a second engine. whisper-rs 0.16
exposes the backends as Cargo features; Huginn wires them so:

1. **One backend per OS, chosen for portability.**
   - **Windows and Linux → Vulkan.** Vendor-neutral: one backend covers NVIDIA, AMD/ATI and Intel. This
     is why Vulkan and **not** CUDA — CUDA is NVIDIA-only and wrong for a product shipped to unknown
     hardware. (`cuda` and `hipblas` features exist for a hand-tuned build, but are not shipped.)
   - **macOS → Metal.** Apple has no native Vulkan; Metal is the native, fast path (Apple Silicon and
     Intel Macs). Landed with the macOS line (PLAN.md phase 1b); the structure is in place now.
2. **Opt-in, and shipped in the release worker only.** The features default off. `prepare-worker.mjs`
   enables the platform backend **only** for the `--release` sidecar (and on demand with `--gpu`);
   `check:all`, `gen:types` and the debug worker build CPU-only. So **the local gate needs no GPU SDK** —
   only a build that produces a shipped artefact does. `HUGINN_CPU_ONLY=1` forces CPU even for a release.
3. **Runtime falls back to the CPU.** `use_gpu` defaults to true exactly when a GPU backend is compiled
   in; whisper.cpp then uses the GPU if it finds a usable device and **falls back to the CPU if it does
   not**. An installed app therefore never fails for want of a GPU — it is only slower. The active
   backend (`vulkan`/`metal`/`cpu`) and `use_gpu` are **logged** at model load and on every
   transcription, so a slow run is diagnosable from the log alone, never a guess (ADR-CORE-004).

## What ships, and what does not (ADR-PROJ-006)

A model is data; a backend is **code**, and code is shipped with the app, never downloaded. The GGML
Vulkan/Metal backend and its compute shaders are **compiled into the worker binary**. The Vulkan
**loader** (`vulkan-1.dll`) and the GPU **driver (ICD)** are system components that come with the OS and
the user's graphics driver — Huginn ships neither, and downloads nothing. This keeps the single-network-
call promise (ADR-PROJ-006, rule:speech-and-privacy) intact: the only socket in the product is still the
user-clicked model download.

## What this is not

- **Not word-level streaming.** The engine is still whisper.cpp, a batch recogniser (ADR-PROJ-011). GPU
  makes each batch fast; it does not turn whisper into an incremental model. Word-level live output would
  need a different, streaming-native engine — a separate decision behind the same trait.
- **Not a model change.** The same `ggml-*` files run unchanged; the backend is orthogonal to which model
  is loaded (ADR-PROJ-006).

## Consequences

- **Build:** a release/`--gpu` build requires the platform GPU SDK on the build machine (on Windows the
  Vulkan SDK; `prepare-worker.mjs` auto-detects `C:\VulkanSDK\*` or reads `VULKAN_SDK`). The debug/gate
  build does not. Producing **release artefacts in CI** needs the SDK in the matrix — but `release.yml` is
  a pinned upstream file (rule:upstream-changes); wiring the SDK into it is a **separate, open** governance
  step and does not block a local dev/test build.
- **Crates:** `huginn-asr` gains `vulkan`/`metal`/`cuda` features (each → the matching `whisper-rs`
  feature); `huginn-asr-worker` forwards them; `whisper.rs` exposes and logs `BACKEND`.
- **Testing:** the pure logic (thread heuristic, backend selection) is unit-tested; the speed-up itself is
  a **measurement** on real hardware (the RTF the log records), not a claim (ADR-CORE-004).
