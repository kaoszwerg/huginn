# 104 — no entry point of this shell dies silently (ADR-APP-032)

Audience: the agent working in a project **forked from this Tauri shell**.
Layer: **app** (delivered by `governance:update`).

## Read this first: your `npm run lint` is now red, on purpose

This update ships `eslint.config.mjs` (pinned, app-layer) with a new **crash gate**, and the gate checks
files that live in **your** source tree — which the update does **not** touch. Until you do the work
below, every `npm run lint`, and therefore every `check:all` and every commit, fails with:

```
ADR-CORE-037 — an entry point can die silently:
  - src-tauri/src/lib.rs never calls crash::install_panic_hook() — a panic would end the process with
    no log, no report and no message.
  ...
```

That is not a bug in the update. It is the gate doing the one thing prose could not: making the silent
crash **impossible to ignore**. Work through it; it is a mechanical port.

## What changed, and why you cannot skip it

The core now forbids the silent crash (ADR-CORE-037: *a crash is permitted, a silent crash is not*) and
explicitly hands the **mechanism and the gate** to the stack layer — this one. ADR-APP-032 is that
mechanism.

Your fork has the same three holes the template had:

1. **`main.rs` builds with `windows_subsystem = "windows"`.** In a release build on Windows there is **no
   console** — every panic message, every stderr line, goes nowhere.
2. **`lib.rs` ended the builder with `.expect(..)`.** A failure to resolve the app data dir panicked into
   that non-existent stderr: no window, no log, no file. The user's whole bug report is *"it did not
   start"*.
3. **The webview is a second runtime with no handler at all.** A Rust panic hook cannot see a throw
   inside React. Without a boundary, the user gets a blank window and you get nothing.

## What you must do

The template carries the working implementation — port it, do not reinvent it (ADR-CORE-005).

**1. Copy the mechanism** from the template into your fork (adjusting imports to your crate/module names):

| From the template                | Into your fork                                       |
| -------------------------------- | ---------------------------------------------------- |
| `src-tauri/src/crash.rs`         | your backend (`pub mod crash;` in `lib.rs`)          |
| `src/lib/crash.ts`               | your frontend                                        |
| `src/components/CrashBoundary.tsx` | your frontend                                      |
| `src/components/FatalScreen.tsx` | your frontend — restyle it to **your** design system  |
| `src/components/CrashNotice.tsx` | your frontend, mounted in `App.tsx`                  |
| `crash-boundaries.json`          | your repo root (project-owned — **not** delivered)    |

**2. Wire the backend entry point** (`src-tauri/src/lib.rs`):

- `crash::install_panic_hook();` as the **first statement** of `run()` — *before* `tauri::Builder`. A
  panic while resolving the app data dir happens before logging exists; a hook installed inside
  `logging::init` misses exactly the startup failures you need it for.
- Do **not** `.expect()` the builder's result. Handle the `Err` and call `crash::fatal(.., EXIT_STARTUP)`.
- Move your `setup()` body into a fallible function and call `crash::fatal(.., EXIT_STARTUP)` on `Err`.
  Tauri turns an `Err` from the setup closure into `panic!("Failed to setup app: {e}")` (verified in
  tauri 2.11.2, `app.rs`) — it never reaches `run()`'s `Result`, and the exit code would otherwise claim
  a panic where a startup failure happened.
- Register the three commands: `report_crash`, `pending_crash`, `exit_after_crash`.
- If your `logging.rs` still owns a panic hook, **remove it** and add `pub fn flush()` (drop the
  appender's `WorkerGuard`) instead — see below.

**3. Wire the UI entry point** (`src/main.tsx`):

- `installGlobalCrashHandlers(showFatal)` **before** the first render, and mount your tree inside
  `<CrashBoundary>`.
- If you `throw` when the mount point is missing, that throw goes nowhere. Report it and show the fatal
  screen instead.

**4. Declare every background task** in `crash-boundaries.json`. The gate counts the spawns in your Rust
sources (`async_runtime::spawn`, `tokio::spawn`, `spawn_blocking`, `thread::spawn`) and refuses any it
cannot find there. Each entry answers one question, in writing: **how does this task die?**

```json
{
  "tasks": {
    "src-tauri/src/lib.rs": {
      "spawns": 1,
      "why": "The log bridge: on RecvError::Lagged it warns and KEEPS BRIDGING; on Closed it logs and ends. It never exits quietly."
    }
  }
}
```

Then: `npm run gen:types && npm run check:all`.

## The bug you almost certainly have too

Your log bridge is probably still this:

```rust
while let Ok(rec) = rx.recv().await { let _ = handle.emit("log://record", rec); }
```

A `broadcast` receiver returns **`Err(Lagged)`** when the consumer falls behind — and `while let Ok(..)`
**ends the loop** on it. The bridge dies, the log view freezes for the rest of the session, and nothing
anywhere says so. Match on the error instead: **warn and keep bridging** on `Lagged`, end only on
`Closed`. (`rule:code-quality` — fix on sight, whichever session wrote it.)

## What is now forbidden

- **A last-resort handler that resumes.** It reports and **terminates**. Keeping the process alive on
  state you cannot vouch for trades a visible crash for silent data corruption (ADR-CORE-037).
- **`.expect()` / `.unwrap()` on the builder result**, or any panic left to reach a stderr that a
  windows-subsystem binary does not have. The gate rejects it.
- **A background task that is not declared.** Spawning work creates an entry point. The gate rejects it.
- **`tauri-plugin-dialog` on the fatal path.** Its `blocking_show()` is documented as unsafe on the main
  thread, and a panic hook runs on whichever thread panicked. Use the plugin-free message box in
  `crash.rs` (`MessageBoxW` / `osascript` / `zenity`) — it needs no event loop and cannot deadlock you.
- **Uploading the crash report.** It stays on the device. Shipping it anywhere is telemetry and needs its
  own opt-in ADR (`rule:privacy`, ADR-CORE-011).
- **Per-view error boundaries that retry.** That is *survival*, and it carries a burden of proof: with a
  shared Query cache you cannot show that no shared state is corrupt, so the answer is no. If a feature
  genuinely isolates a subtree, prove it in its own ADR (ADR-CORE-037).

## Why the report is written twice

`tracing_appender`'s non-blocking writer flushes its buffer when the `WorkerGuard` drops — and a
deliberate `process::exit` runs **no destructors**. The records describing the crash are therefore the
ones most likely to be lost. So the crash path writes the report **synchronously** with `std::fs`, *and*
calls `logging::flush()` to drop the guard before exiting. Do not "simplify" this back into a single
`tracing::error!` and an exit: that is how you get a crash file that is empty exactly when it matters.
