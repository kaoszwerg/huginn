# 007 — No entry point dies silently (ADR-CORE-037)

Audience: the agent working in any project that consumes this core.
Layer: **core** (delivered by `governance:update`).

## What changed

The governance covered the error a component **caught** (`rule:logging`: *"every **caught** error is logged
and surfaced"*) and forbade a panic on a path already known to be fallible (`rule:code-quality`). It said
nothing about the error **nobody** caught — the one that reaches the top of the stack and ends the process.
New rule: [`rule:crash-handling`](../../.claude/rules/crash-handling.md), anchored in core principle #7.

> **A crash is permitted. A silent crash is not.**

## What you must do

**1. Give every entry point a last-resort handler.** An entry point is any place a runtime starts executing
your code with nothing above it to report to: a process `main`, a UI root, a request handler at the edge, a
worker loop, a scheduled job, a platform callback. **A multi-runtime app has more than one** — a handler in
your backend does not catch what your UI runtime threw, and the user is left staring at a blank window.
Inventory them, then make each one, before anything goes down:

1. **log** the error with its cause chain and stack, at `error`, through the one structured logger;
2. **tell the user** in a sentence they can act on, and where the detail is;
3. **leave a durable record on the device** — the file they can send you. **On-device only:** a crash
   report that phones home is telemetry and needs its own opt-in ADR (`rule:privacy`);
4. **exit deliberately** — defined, non-zero code;
5. **suppress nothing.**

**2. Where you keep the process alive, prove the isolation.** Continuing is allowed only at a declared
isolation boundary: a discardable unit (a UI subtree, a request, a job) that is **discarded, not resumed**;
no shared mutable state that could be corrupt — **shown, not assumed** (ADR-CORE-004); the user visibly
learns something failed; and a repeat **escalates** rather than looping forever. **If you cannot show it,
the process goes down.**

**3. If you own a stack layer: publish the mechanism *and* the gate.** The core cannot check this — it does
not know what an entry point is in your runtime, and it may not learn (ADR-CORE-033). Your layer can. Write
the companion ADR (which hook, which UI containment, where the crash file goes, what the supervisor is) and
**add a check to `check:all`** that fails when an entry point has no handler. `rule:knowledge-handover` §1
ranks a gate above a paragraph, and this is the layer that can build one.

Then: `npm run governance:sync && npm run check:all`.

## What is now forbidden

- **A global catch-all that resumes.** Catching everything at the top and returning to the main loop is a
  **swallowed error at the outermost scope** — against `rule:code-quality` (*"No swallowed errors: log
  **and** surface"*) and `rule:logging` (*"Swallowing an error is a defect"*). It also leaves the process
  running on state it can no longer vouch for: you have traded a visible crash for silent data corruption.
  The last-resort handler **reports and terminates**; surviving is the narrow, proven exception, not the
  default.
- **An endless silent restart.** A unit that fails, restarts, fails, restarts is a silent crash with extra
  steps. Bound it, then go down.
- **Shipping the crash report off-device.** That is telemetry (`rule:privacy`), not error handling.
- **"It probably didn't corrupt anything."** That is the guess ADR-CORE-004 forbids, made at the worst
  possible moment.

## Why

The failure this closes is the one your user actually meets: a window that vanishes, a binary that exits
with no output, a blank screen. What it hands you is the worst bug report there is — *"it crashed"*, with
no evidence attached. A defect that leaves nothing behind cannot be proven, and therefore cannot be fixed.

The rule deliberately does **not** say "never crash". A process that cannot vouch for its own state should
end — loudly, with everything it knows written down. What is unacceptable is not the death. It is the
silence.
