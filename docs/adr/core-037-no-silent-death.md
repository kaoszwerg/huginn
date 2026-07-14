---
id: ADR-CORE-037
title: No silent death — every entry point has a last-resort handler
status: accepted
tldr: "Nothing governed the error nobody caught. A crash is permitted — a silent crash is not: every entry point reports before it dies. Survival needs proof."
scope: global
load: conditional
triggers:
  [crash, panic, unhandled, uncaught, fatal, abort, entry-point, last-resort, error-boundary, supervisor, exit-code, stacktrace]
applies-to: [".claude/rules/crash-handling.md", ".claude/rules/core-principles.md"]
supersedes: []
superseded-by: null
---

## Context

Grep this governance for the vocabulary of a crash — `panic`, `crash`, `uncaught`, `unhandled`, `abort`,
`fatal` — and it returns two hits, neither of them this:

- `rule:code-quality` — *"No panic/abort on a fallible production path."* That is **prevention on a path
  already known to be fallible.** The error this ADR is about is, by definition, the one nobody saw coming.
- `rule:privacy` — "crash-reporting" appears only as **forbidden telemetry**.

`rule:logging` states its own boundary in as many words: *"Every **caught** error is logged and
surfaced."* `rule:core-principles` §7 promises *"no failure is swallowed"* — and every mechanism it points
at operates on an error that something already holds in its hands.

The governance was thorough about the errors it expected, and silent about the last one: the failure that
reaches the top of the stack with nobody left to report to. What that permitted is exactly what a user
meets — **a window that vanishes, a binary that exits with no output, a blank screen** — and what it hands
the maintainer is the worst artefact there is: a bug report that says *"it crashed"* and carries no
evidence. A defect that leaves nothing behind cannot be proven, and therefore cannot be fixed
(ADR-CORE-004).

It was also **unreachable**. Running the lookup a future agent would actually run:

```
$ node scripts/context-for.mjs "crash panic unhandled exception uncaught fatal"
  docs/adr/core-035-cross-layer-supersession.md  (trigger:exception)
```

An agent asking this governance what to do about a crash was not merely unanswered — it was handed the ADR
about *cross-layer supersession*, on a collision with the word "exception" in its governance sense.

## Decision

**A crash is permitted. A silent crash is not.**

Every **entry point** — every place a runtime begins executing our code with nothing above it to report to
— installs a **last-resort handler**. Before anything goes down, that handler logs the error with its cause
chain and stack through the structured logger, tells the user in a sentence they can act on, leaves a
durable record **on the device**, and exits deliberately with a defined code. It suppresses nothing. In a
multi-runtime application there is more than one entry point, and a handler in one runtime does not cover
another. Operational form: `rule:crash-handling`.

**The handler may keep the process alive — under a burden of proof.** Continuation is legitimate only at a
**declared isolation boundary**: there is a discardable unit of work (a UI subtree, a request, a job); the
failed unit is **discarded, never resumed**; corruption of shared mutable state is **shown** to be
impossible rather than assumed; the user visibly learns that something failed; and a recurring failure
escalates instead of looping. **Uncertainty resolves downward — if it cannot be shown, the process goes
down.**

That is supervision — *the smallest isolatable unit dies loudly, and its supervisor lives* — and it is the
opposite of a catch-all. A `try` around the world that returns to the main loop and carries on is a
swallowed error at the top of the stack, and stays forbidden (`rule:code-quality`, `rule:logging`).

**The obligation is portable; the mechanism is not.** Which hook a runtime exposes, what contains a UI
subtree, where the crash file is written, what a supervisor is built from — each names a stack, and belongs
to that stack's layer (ADR-CORE-033), which is also the only layer that can see the entry points and
therefore the only one that can **gate** this.

## Alternatives

- **Extend `rule:logging` instead of writing a new rule** — rejected. That rule's subject is the error a
  component *holds*: which logger, which fields, which level, log-and-surface. This one is about the error
  nobody holds, and its content is not logging but **control flow at the top of the stack**: die or
  survive, at which boundary, on what proof, with which exit code. Filing it there also buries it behind
  the wrong triggers — an agent staring at a crash types `panic`, never `observability`
  (`rule:knowledge-handover` §2).
- **Put the whole thing in the stack layer** — rejected, and this is the load-bearing point. *That an entry
  point must not die silently* is equally true of a CLI, a service and a desktop app; it names no framework,
  and putting it downstream would force it to be **rewritten identically in every stack layer** — the
  duplication ADR-CORE-005 exists to prevent. Only the *mechanism* names a stack, and only the mechanism
  goes there.
- **Take the request's literal framing — "catch every exception globally"** — rejected, and rejected *with*
  the maintainer before this ADR was written. A global catch-all that resumes is a swallowed error at the
  outermost scope, in direct conflict with `rule:code-quality` (*"No swallowed errors: log **and**
  surface"*) and `rule:logging` (*"Swallowing an error is a defect, not a style choice"*) — and it leaves
  the process running on state it can no longer vouch for, trading a visible crash for silent data
  corruption. What was actually asked for was *"never crashes **without leaving a clean error message**"*:
  a **reporting** mandate, not a **resumption** mandate. That is what is written down.
- **"Let it crash" — no handler at all, on the Erlang argument** — rejected as a **misreading** of it. That
  model does not omit the handler; it *is* one: a supervisor that observes the death, records it, and
  restarts a **defined, isolated** unit. Its guarantees come from process isolation and immutable state,
  neither of which a shared-memory runtime gives you for free. The half that survives translation is kept
  above (discard the unit, prove the isolation, escalate on repeat); the half that does not — *"crash
  freely, something upstairs will cope"* — is precisely what produces the vanishing window.
- **Gate it in the core** — rejected as **impossible**, not as undesirable. A check that an entry point has
  a handler must know what an entry point *is* in this stack, and the core may not know that
  (ADR-CORE-033). The gate is therefore an obligation **on the stack layer**, stated as such, so a future
  agent reads the absence of one here as a layer boundary and not as an oversight to be fixed by breaking
  it.

## Consequences

- New `rule:crash-handling` (`load: conditional`, carrying the crash vocabulary). Core principle #7 gains
  the clause that puts that vocabulary into every agent's always-loaded context — necessary, because an
  agent scaffolding a new application never thinks the word "crash" while writing the very entry point this
  rule governs.
- **Consumers must act:** every existing application needs a handler at every entry point it has, and each
  stack layer must publish the mechanism **and** the gate. Briefing:
  [`docs/migrations/core-007-crash-handling.md`](../migrations/core-007-crash-handling.md).
- **Not gate-enforceable in this layer** — stated openly, here and in the rule.
- The word "exception" now collides across two ADRs (ADR-CORE-035 and this one) in `context-for.mjs`.
  Accepted: 035's sense is governance-internal and its other triggers disambiguate it, while this ADR
  carries the terms an agent facing a real crash actually types.

## References

- [ADR-CORE-004](core-004-verify-first-no-guessing.md) — *"the state is probably fine"* is not a
  verification; it is the guess this governance forbids, made at the worst possible moment.
- [ADR-CORE-011](core-011-security-by-design.md) — the crash record stays **on the device**; a crash
  reporter that phones home is telemetry and needs its own opt-in ADR (`rule:privacy`).
- [ADR-CORE-033](core-033-governance-layers-cascade.md) — why the obligation is portable and the mechanism
  is not.
- [ADR-CORE-005](core-005-reusability-policy.md) — why this is not rewritten once per stack layer.
- `rule:crash-handling` (operational form) · `rule:logging` · `rule:code-quality` · `rule:privacy`.
