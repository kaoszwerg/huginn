# Implementation plan

Every decision behind this plan is an ADR in `docs/adr/project/`. Read the ADR before contradicting a
line here. Nothing below is started until the phase above it is green in `check:all`.

## How we work: the Windows line here, the macOS line on the Mac

**The development machine is Windows.** Everything below is built and verified here on the **Windows
line**. When a task is macOS-specific — the `NSPanel`, `CGEvent` injection, `SMAppService` autostart, TCC
permission prompts, the signed DMG — the maintainer **switches the development environment to the Mac**
and it is built and verified *there*. macOS work is not written blind on Windows and hoped for.

What follows from that, and it is not negotiable (ADR-CORE-004):

- **Never assert macOS behaviour from a Windows machine.** Not "should work", not "the API exists". If it
  was not run on the Mac, it is marked **open** — in the ADR, in the reply, in the commit.
- **The platform trait comes first, both implementations do not.** `huginn-platform` defines the contract;
  the Windows implementation lands complete, the macOS one lands complete **on the Mac**. A
  `#[cfg(target_os = "macos")]` branch that nobody has compiled is not a stub — it is unwritten, and the
  plan says so out loud rather than pretending otherwise.
- **A macOS-tagged item below is a handover point.** Reaching one means: stop, switch machine, continue
  there. Items are tagged **[mac]**.

## Phase 0 — Scaffold (done)

- Rebased on `saga-rust-template`; upstream adopted (`core` from althing + `app` from saga, 103 pinned
  files). Huginn publishes nothing.
- Identity set (`Huginn` / `huginn` / `ai.lysis.huginn`, provisional — ADR-PROJ-002).
- The decisions from the design conversation written down as ADR-PROJ-001 … 009.
- Release-blocker gate (`release:check`) wired into `beforeBuildCommand` — a bundled build refuses while
  a deferred decision stands open.
- `check:all` green.

## Phase 1 — The spike that decides the architecture

**Nothing else starts before this is answered.** If the overlay cannot be made focus-neutral, ADR-PROJ-001
and ADR-PROJ-004 are reopened before a single line of product code exists.

### 1a — Windows — **PASSED** (2026-07-13, report: [`docs/spike-1a-windows.md`](docs/spike-1a-windows.md))

1. ✅ A transparent, borderless, always-on-top, click-through overlay that **does not take focus**.
   Proven end to end by `scripts/project/prove-focus-neutrality.ps1`: the caret stayed in the target
   window and the injected text landed *there*.
   **It cost a decision:** the window cannot be created per recording — `build()` takes the foreground
   even hidden and unfocusable. It is built **once**, then shown/hidden. ADR-PROJ-004 is amended.
2. ✅ **Push-to-talk** with key-up (`hold_ms=1561` for a 1500 ms hold — the ~50 ms is the documented
   Windows polling interval). `Ctrl+Alt+Space` turned out to be **taken** on the dev machine, so the
   hotkey is now configurable and its failure is **shown in the window**, not logged.
3. ⏳ **Idle cost over ≥ 1 h** — open. The tool exists (`scripts/project/measure-idle.mjs`); the question
   changed, because the overlay window now always exists (hidden). Must be measured on a **release**
   build: a debug build with the Vite dev server attached is not an honest number.

A green 1a is enough to start Phase 2 on the Windows line. It is **not** enough to claim the architecture
works — that needs 1b.

### 1b — macOS **[mac]** (switch the development environment)

4. The same overlay as a **non-activating `NSPanel`** (`ns_window()` + `objc2`) — proven in a **bundled**
   build, never in `tauri dev` (tauri#13415: transparency works in dev and turns opaque in the DMG). Use
   `HUGINN_UNRELEASABLE_BUILD=1 npm run app:build`.
5. **Idle/GPU cost** over ≥ 1 h with the overlay open (tauri#15471: a transparent window costs ~8× GPU
   power on macOS for as long as it exists — this is the number that decides whether the overlay may exist
   outside a recording).
6. Confirm a normal hotkey combination raises **no** permission prompt (and that a media key would — so we
   never default to one).

**Ad-hoc signing is enough for 4–6.** Autostart via `SMAppService` is **not** testable without the Apple
Developer account (ADR-PROJ-002) — that stays open, and is written as open.

Output: a short report in `docs/` with the measurements, and the ADRs updated with what was actually
observed. The spike code is throwaway; the findings are not.

## Phase 2 — The skeleton that everything hangs on — **done on the Windows line** (v0.6.0, `check:all` green)

- ✅ **Cargo workspace** rooted at `src-tauri/` (ADR-PROJ-009): six crates, building and tested.
- ✅ **Job registry + process monitor** (ADR-PROJ-008) — the logging chokepoint everything reports
  through. `Job` generated to TypeScript via `gen:types` and rendered by `JobMonitor`.
- ✅ Storage layout (ADR-PROJ-007): the models dir is resolved through Tauri's `app.path()`.
- **Platform layer — partially.** The **Windows** implementation is complete and real code
  (`src-tauri/src/spike/win32/`: focus-neutral overlay, `SendInput` injection, focus tracking) plus the
  autostart plugin. **Not yet extracted into a clean `huginn-platform` trait crate** — that refactor and
  the **macOS** implementation land together **[mac]**, on the Mac, so the trait is shaped by two real
  callers rather than guessed from one.

## Phase 3 — Speech — **done on the Windows line** (v0.6.0, `check:all` green)

- ✅ **Engine chosen by measurement** (ADR-CORE-004): whisper.cpp, the `base` multilingual model, picked
  on measured German WER (~4.2%) and speed, not reputation. (A streaming-engine comparison remains a
  future option, not a blocker.)
- ✅ `huginn-asr-proto` + `huginn-asr-worker`: the deprivileged sidecar process, protocol pinned by tests
  on **both** sides; a crashed worker is surfaced, not fatal.
- ✅ `huginn-audio`: capture (cpal) → mono → Butterworth low-pass resample to 16 kHz → normalisation.
- ✅ End to end (Windows): hold the hotkey → speak → release → the text appears in the focused
  application. Proven microphone-free by the worker pipeline test (known German fixture → expected words).

## Phase 4 — Models — **done on the Windows line, bar local import** (v0.6.0, `check:all` green)

- ✅ `huginn-models`: the catalogue compiled into the binary (id, URL, SHA-256, size, languages), the
  verified downloader (the only network call), content-addressed storage and the atomic swap.
- ✅ The `base` model is the shipped default; every step is a Job with progress, an honest ETA and a
  working cancel (ADR-PROJ-008).
- ⬜ **Importing a local model file from disk** (unverifiable, UI must say so — rule:model-assets) is
  **not built yet**.

## Phase 5 — The product

- ✅ **Huginn's own design system** (ADR-PROJ-003) — release blocker closed.
- ✅ Settings, substantially: hotkey, model, recognition language, microphone, start/stop sounds,
  autostart, theme, UI language.
- ⬜ Text post-processing (`huginn-text`): punctuation, a user dictionary, spoken commands — **not built**.
- ⬜ Injection strategy choice (keystrokes vs. clipboard) and overlay position — **open**.

## Release blockers (they stop a build, not the work)

Tracked in [`release-blockers.json`](release-blockers.json), enforced by `npm run release:check`:
the publisher and bundle identifier, the Apple Developer account, the project licence, the trademark
check, and the design system.

## Not planned

- Any form of telemetry, analytics, crash reporting or auto-update ping.
- Storing audio or transcripts anywhere, for any reason.
- Downloading executable code at runtime.
