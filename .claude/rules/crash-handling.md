---
id: rule:crash-handling
title: Crash handling — no entry point dies silently
tldr: "A crash is allowed; a silent crash is not. Every entry point logs, tells the user and records on device before it exits. Survive only where isolation is proven."
scope: global
load: conditional
triggers:
  [crash, panic, unhandled, uncaught, exception, fatal, abort, entry-point, main, error-boundary, top-level, last-resort, supervisor, restart, exit-code, stacktrace, segfault]
applies-to: ["**/main.*", "**/index.*", "**/bin/**"]
---

# Crash handling — no entry point dies silently (ADR-CORE-037)

Every process has a last line: the error nobody caught. `rule:logging` governs the error that **was**
caught (*"every **caught** error is logged and surfaced"*); `rule:code-quality` forbids a panic on a path
you already knew could fail. Neither covers the one you did not see coming — and that is precisely the
error that ends the process.

**A crash is permitted. A silent crash is not.**

## The obligation

**Every entry point installs a last-resort handler.** An entry point is any place a runtime starts
executing your code with nothing above it to report to: a process `main`, a UI root, a request handler at
the edge, a worker loop, a scheduled job, a callback the platform invokes. A multi-runtime application has
**more than one** — a handler in the backend does not catch what the UI runtime threw, and a user looking
at a blank window is being told nothing.

Before the process (or the isolated unit) goes down, the handler:

1. **Logs it** — the error, its cause chain and a stack trace, at `error`, through the one structured
   logger (rule:logging). Never a bare `print` on the way out.
2. **Tells the user** — one human sentence they can act on, and where the detail is. A vanished window, a
   disappeared tray icon or an exit with no output is a defect, not an edge case.
3. **Leaves a durable record on the device** — the log or crash file the user can actually send you.
   **On-device only:** a crash report that phones home is telemetry and needs its own opt-in ADR
   (rule:privacy).
4. **Exits deliberately** — a defined, non-zero exit code; resources released as far as is still safe.
5. **Suppresses nothing.** The handler *reports and terminates*. It does not "handle" the error into
   silence — a last-resort handler that swallows is the one thing worse than the crash it hid.

## Surviving instead of exiting — allowed, but you carry the burden of proof

The handler **may** keep the process alive rather than end it — but only at a **declared isolation
boundary**, and only when every one of these holds. Uncertainty is not a tie: **what you cannot show, you
do not get; you go down.**

- **There is a unit to discard.** The boundary encloses one abandonable piece of work — a UI subtree, a
  single request, one job, one plugin. The failed unit is **discarded, never resumed**: that work is dead.
  Only the container survives.
- **No shared mutable state can be corrupt — and you *show* it** (ADR-CORE-004). If the unit could have
  been half-way through a write, a transaction or a mutation someone else reads, the state is suspect and
  the process goes down. *"It probably didn't"* is a guess, made at the worst possible moment.
- **The user sees the failure.** A subtree replaced by a visible error state is containment. A subtree
  replaced by nothing, while the app pretends to be fine, is a lie — and a silent crash by another name.
- **Everything above still happens.** Survival changes the **exit**, never the **report**: it is still
  logged, still surfaced, still recorded.
- **A repeat escalates, it does not loop.** A failure that recurs at the same boundary is bounded (a
  retry budget, then take the process down). An endless silent restart is a silent crash with extra steps.

This is **supervision**, not a catch-all: the smallest isolatable unit dies loudly, and its supervisor
lives. A `try` around the world that returns to the main loop and hopes is none of that — it is a swallowed
error at the top of the stack, and it stays forbidden (rule:code-quality, rule:logging).

## Where the mechanism lives

**The obligation is here; the mechanism belongs to the stack.** Which hook a runtime exposes, what contains
a failing UI subtree, where the crash file is written, what a supervisor is built from — all of it names a
stack, so the app/stack layer that owns the runtime decides it, and that layer (the only one that can see
the entry points) is also the one that **gates** it (rule:knowledge-handover §1). Load its rule alongside
this one when you touch an entry point. The core cannot check this for you — that is a layer boundary, not
an oversight.
