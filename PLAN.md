# Implementation plan

Every decision behind this plan is an ADR in `docs/adr/project/`. Read the ADR before contradicting a
line here. Nothing below is started until the phase above it is green in `check:all`.

## Phase 0 — Scaffold (done)

- Rebased on `saga-rust-template`; upstream adopted (`core` from althing + `app` from saga, 103 pinned
  files). Huginn publishes nothing.
- Identity set (`Huginn` / `huginn` / `ai.lysis.huginn`, provisional — ADR-PROJ-002).
- The decisions from the design conversation written down as ADR-PROJ-001 … 009.
- Release-blocker gate (`release:check`) wired into `beforeBuildCommand` — a bundled build refuses while
  a deferred decision stands open.
- `check:all` green.

## Phase 1 — The spike that decides the architecture (next)

**Nothing else starts before this is answered.** If the overlay cannot be made focus-neutral, ADR-PROJ-001
and ADR-PROJ-004 are reopened before a single line of product code exists.

1. **Windows**: a transparent, borderless, always-on-top, click-through overlay that **does not take
   focus** (`WS_EX_NOACTIVATE` via `hwnd()`). Proof: the caret stays in another application's text box
   while the overlay is up, and synthesised keystrokes land _there_.
2. **macOS**: the same, as a non-activating `NSPanel` (`ns_window()` + `objc2`) — proven in a **bundled,
   signed build**, not in `tauri dev` (tauri#13415: transparency works in dev and turns opaque in the
   DMG). Use `HUGINN_UNRELEASABLE_BUILD=1 npm run app:build`.
3. **Idle cost**, measured over ≥ 1 h on both platforms, with and without the overlay open (tauri#15471:
   a transparent window costs ~8× GPU power on macOS for as long as it exists).
4. **Push-to-talk**: `ShortcutState::Pressed` / `::Released` with `tauri-plugin-global-shortcut >= 2.3.2`.
   Confirm key-up fires, and that a normal combination needs no macOS permission prompt.

Output: a short report in `docs/` with the measurements, and the ADRs updated with what was actually
observed. The spike code is throwaway; the findings are not.

## Phase 2 — The skeleton that everything hangs on

- **Cargo workspace** rooted at `src-tauri/` (ADR-PROJ-009), crates created empty but building.
- **Job registry + process monitor** (ADR-PROJ-008) — first, because everything after it reports through
  it, and because it is also the logging chokepoint. `Job` generated to TypeScript via `gen:types`.
- **`huginn-platform`**: the trait and both implementations for paths, hotkey, overlay window, injection,
  autostart. The spike's findings land here as real code.
- Storage layout (ADR-PROJ-007): lowercase `huginn/` directories, resolved through the platform API.

## Phase 3 — Speech

- **Benchmark first** (ADR-CORE-004): whisper.cpp vs. a streaming engine on German test audio — WER and
  latency, on the maintainer's hardware. The result decides the engine and is written into ADR-PROJ-005.
- `huginn-asr-proto` + `huginn-asr-worker`: the deprivileged sidecar process, its protocol pinned by tests
  on **both** sides.
- `huginn-audio`: capture (cpal), resampling to what the model wants, a bounded ring buffer.
- End to end: hold the hotkey → speak → release → the text appears in the focused application.

## Phase 4 — Models

- `huginn-models`: the catalogue compiled into the binary (id, URL, SHA-256, size, licence, languages),
  the verified downloader, content-addressed storage, the atomic swap, and importing a local file.
- Choose and bundle the base model (a benchmark decides which; the licence goes into the SBOM).
- Every step a Job with progress, an ETA and a cancel button (ADR-PROJ-008).

## Phase 5 — The product

- Text post-processing (`huginn-text`): punctuation, a user dictionary, spoken commands.
- Settings: hotkey, model, language, injection strategy, autostart, overlay position.
- **Huginn's own design system** (ADR-PROJ-003) — this closes a release blocker.

## Release blockers (they stop a build, not the work)

Tracked in [`release-blockers.json`](release-blockers.json), enforced by `npm run release:check`:
the publisher and bundle identifier, the Apple Developer account, the project licence, the trademark
check, and the design system.

## Not planned

- Any form of telemetry, analytics, crash reporting or auto-update ping.
- Storing audio or transcripts anywhere, for any reason.
- Downloading executable code at runtime.
