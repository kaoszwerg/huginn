---
id: ADR-APP-032
title: Crash handling on this stack — the mechanism and the gate
status: accepted
tldr: "ADR-CORE-037 on Tauri: panic hook before the builder, CrashBoundary + window handlers in the UI, a synchronous crash report, a native message box, a lint gate."
scope: backend
load: conditional
triggers:
  [
    crash,
    panic,
    unhandled,
    uncaught,
    exception,
    fatal,
    abort,
    entry-point,
    main,
    error-boundary,
    top-level,
    last-resort,
    exit-code,
    stacktrace,
    startup,
    spawn,
    background-task,
    dialog,
    messagebox,
  ]
applies-to:
  [
    "src-tauri/src/crash.rs",
    "src-tauri/src/lib.rs",
    "src-tauri/src/main.rs",
    "src/main.tsx",
    "src/lib/crash.ts",
    "src/components/CrashBoundary.tsx",
    "src/components/FatalScreen.tsx",
    "crash-boundaries.json",
    "scripts/lib/crash-gate.mjs",
  ]
supersedes: []
superseded-by: null
---

## Context

[ADR-CORE-037](core-037-no-silent-death.md) states the obligation — *a crash is permitted, a silent crash
is not* — and states just as plainly that the core **cannot enforce it**: it does not know what an entry
point is on this stack, and it may not learn (ADR-CORE-033). It hands the mechanism *and the gate* to the
layer that owns the runtime. This is that layer, and this ADR is that answer.

The shell was a textbook instance of the failure. Three things were true at once:

- `src-tauri/src/main.rs:2` builds with `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
  — a release build on Windows has **no console**, so everything on stderr, including a panic message,
  goes nowhere.
- `src-tauri/src/lib.rs` ended the builder with `.expect("error while building the Tauri application")`.
  A failure to resolve the app data dir therefore panicked into that non-existent stderr: **the window
  never appeared, and nothing was written anywhere.**
- The webview — a **second runtime**, invisible to any Rust panic hook — had no error boundary, no
  `window.onerror`, no `unhandledrejection` handler, and no way to write into the log at all. A throw
  during render produced a blank window and left no evidence.

There *was* a panic hook (in `logging.rs`), and it logged. But it logged through
`tracing_appender`'s **non-blocking** writer, whose buffer is flushed by its `WorkerGuard` on `Drop` —
and a process that aborts runs no destructors. The one record that mattered most was the one most likely
to be lost.

## Decision

**Every entry point of this shell reports before it dies.** The mechanism lives in two modules —
`src-tauri/src/crash.rs` for the backend, `src/lib/crash.ts` for the UI — and is enforced by a gate.

### The backend (`crash.rs`)

- **The panic hook is installed first**, in `run()`, *before* `tauri::Builder` — a panic while resolving
  the app data dir happens before logging exists, so a hook installed inside `logging::init` would miss
  precisely the startup failures it is needed for. Until the data dir is known, reports land in the temp
  dir; `crash::set_data_dir` re-points them as soon as `setup()` resolves it.
- **The crash report is written synchronously** with `std::fs`, to `<app_data_dir>/crashes/`, *not*
  through the tracing file layer — see the flush problem above. `logging::flush()` (which drops the
  appender's guard) is called on the fatal path so the log file gets its final records too.
- **The user is told with a native message box that does not need Tauri's event loop.** Deliberately
  **not** `tauri-plugin-dialog`: its `blocking_show()` is documented as unsafe on the main thread, and a
  panic hook runs on whichever thread panicked — including the main one, whose event loop may be the
  thing that is broken. A startup failure has no `AppHandle` at all. So: `MessageBoxW` on Windows (via
  the `windows` crate already present for `open_external` — it runs its own modal loop, from any
  thread), and `osascript` / `zenity` as subprocesses on macOS and Linux, which cannot deadlock us.
- **A `pending` marker** is left beside the report, and `pending_crash` hands it to the UI on the next
  launch (`CrashNotice`). This is the backstop: a process that dies before it has a window — or on a
  desktop with no dialog binary — still reaches the user, one launch later.
- **Exit is deliberate and distinct**: `EXIT_PANIC` (101), `EXIT_STARTUP` (102), `EXIT_UI_CRASH` (103).
- **`setup()`'s failure is caught by us, not by Tauri.** Tauri turns an `Err` from the setup closure into
  `panic!("Failed to setup app: {e}")` (tauri 2.11.2, `app.rs`) — it never reaches `run()`'s `Result`.
  The panic hook would catch it, but the process would then claim `EXIT_PANIC` for what is a startup
  failure. We call `crash::fatal(.., EXIT_STARTUP)` ourselves, so the exit code does not lie.

### The UI runtime (`crash.ts`, `CrashBoundary`, `FatalScreen`)

- `CrashBoundary` (a class component, because that is React's only way to catch a render throw) catches,
  reports via the `report_crash` IPC command, and **stops**. There is no `reset()` and no "try again":
  resuming a tree whose state nobody can vouch for is the swallowed error at the top of the stack that
  ADR-CORE-037 forbids.
- `installGlobalCrashHandlers` covers what a boundary structurally **cannot** see — a throw in an event
  handler or a timer, and a rejected promise nobody awaited. It reports from the handler itself, not from
  the fatal screen, because the record must survive even when React is the broken thing.
- `FatalScreen` replaces the whole tree and names the report's path. Its two exits are both clean: a full
  reload (a brand-new UI runtime, nothing carried over) or `exit_after_crash` (`EXIT_UI_CRASH`).

**The isolation that permits the UI to survive at all is declared, not assumed** (ADR-CORE-037's burden of
proof): the failed unit is the render tree, and it is *discarded*; the frontend holds no persistent state
(settings live in Rust, the TanStack Query cache is derived and disposable); the user visibly learns that
it failed. The **process** is not resumed — only the option to start a fresh UI is offered.

### The gate (`scripts/lib/crash-gate.mjs`)

Loaded from `eslint.config.mjs`, exactly like the UI boundary (ADR-APP-026) and for the same reason:
`package.json` is project-owned and a consumer could drop a step from `check:all`, while `npm run lint`
runs in every project, always. It is **not** an ESLint rule because two of the three things it guards are
**Rust** files, which ESLint never sees; a crash gate that could only see half of a two-runtime app would
be worse than none, because it would look like coverage.

It fails the build when: the panic hook is missing or installed after the builder; the builder's result
is `.expect()`ed; the UI root lacks the global handlers or the boundary; or a **background task is not
declared in `crash-boundaries.json`**. That last one is the general case — spawning work creates an entry
point, and the declaration forces one question to be answered in writing: **how does this task die?**

## Alternatives

- **`tauri-plugin-dialog` for the message box** — rejected on evidence. Verified against docs.rs: *"This
  is a blocking operation, and should **NOT** be used when running on the main thread context."* The
  plugin's own example works around it with `thread::spawn(..).join()`, which is exactly the deadlock we
  cannot risk in a panic hook whose event loop may be dead. It also needs an `AppHandle`, which a startup
  failure does not have. It would have been a new dependency that does not work in either case we need it
  for.
- **A global catch-all in Rust that resumes** — rejected; it is ADR-CORE-037's central prohibition, and it
  trades a visible crash for silent state corruption.
- **Per-view React boundaries with retry** — rejected for now. That is *survival*, and survival carries a
  burden of proof (ADR-CORE-037): the views share a Query cache, so "no shared mutable state can be
  corrupt" cannot be *shown*. Uncertainty resolves downward. A future feature that genuinely isolates a
  subtree may revisit this — with the proof, in its own ADR.
- **A crash reporter that uploads** — forbidden without its own opt-in ADR: that is telemetry
  (`rule:privacy`, ADR-CORE-011). The report stays on the device.
- **Gate it as a `package.json` script** — rejected: a consumer can silently drop it, which is the exact
  bypass ADR-APP-026 already closed once.

## Consequences

- New: `src-tauri/src/crash.rs`, `src/lib/crash.ts`, `src/components/CrashBoundary.tsx`,
  `FatalScreen.tsx`, `CrashNotice.tsx`, `scripts/lib/crash-gate.mjs`, `crash-boundaries.json`
  (project-owned), and three IPC commands (`report_crash`, `pending_crash`, `exit_after_crash`).
- `logging.rs` gives up its panic hook (it must be installed before logging exists) and gains `flush()`.
- **A fixed bug, found on the way** (`rule:code-quality`, fix on sight): the log bridge in `lib.rs` was a
  `while let Ok(rec) = rx.recv().await` loop. A `broadcast` receiver returns `Err(Lagged)` when the UI
  falls behind — which **ended the loop**, killing the bridge and silently freezing the log view for the
  rest of the session. It now warns and keeps bridging, and only ends on `Closed`.
- Adding a background task is now a governed act: the gate refuses it until `crash-boundaries.json` says
  how it dies.
- Consumers of this layer must act: [`docs/migrations/app-104-crash-handling-mechanism.md`](../migrations/app-104-crash-handling-mechanism.md).

## References

- [ADR-CORE-037](core-037-no-silent-death.md) — the obligation, and why the gate had to land here.
- [ADR-APP-025](app-025-logging-architecture.md) — the logger this reports through, and the non-blocking
  writer whose flush semantics forced the synchronous crash file.
- [ADR-APP-026](app-026-no-native-ui-primitives.md) — the gate pattern this reuses, and why `FatalScreen`
  is built from HUD primitives rather than stock markup.
- `rule:crash-handling` (the portable obligation) · `rule:logging` · `rule:privacy` (the report stays on
  the device).
