# 100 — The UI rule bans defaults, not libraries (ADR-APP-026)

Audience: the agent working in a project built on `saga-rust-template` (e.g. `ivaldi`).
Layer: **app** (this briefing is published by `saga-rust-template`, not by `althing`).

## What changed

The governance said, in several places, "**never a third-party component library**". That was a
mis-statement of the actual rule, and it has been corrected — in the core (principle 10) and here
(ADR-APP-026, rule:ui-design, rule:stack-tauri).

**The rule is about defaults, not dependencies.**

## What the rule actually is

> **Nothing the user touches may look or behave like a stock element.** Every interactive control a
> **view** renders is a HUD primitive from `src/components/ui/`, brought fully into line with the design
> system — whatever it is built on.

Concretely:

| Where                    | May be built on                                                                                   | May present                            |
| ------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| a **view** (`src/views/`, feature components) | nothing but HUD primitives                                                    | only the HUD                           |
| `src/components/ui/**`   | a native element **or** a headless library (behaviour, a11y wiring, focus, positioning)            | only the HUD — never the source's look |

A component imported straight from a library into a view is **exactly** as wrong as a native `<button>`:
both are a surface the user meets that nobody aligned to the HUD. That was always the point; "no
libraries" was a clumsy proxy for it.

## What you may now do — and what you still may not

- **You may** add a **headless** library (Radix primitives, Floating UI, …) as the mechanism *inside* a
  primitive in `src/components/ui/`. It buys keyboard handling, focus traps and positioning that are easy
  to get subtly wrong. Judge it like any other dependency (rule:dependencies): justify it, check the
  licence, prefer the smaller one.
- **You may not** let anything of it escape that layer — its stylesheet, theme, animations or default
  markup. **If the result still reads as itself in a screenshot, it is not finished.**
- **You may not** reach for a **styled/prebuilt** kit (MUI, shadcn, a component suite). Nothing forbids
  it on principle, but you would spend more effort fighting its skin and its reset than drawing the
  chamfered neon HUD yourself, and its defaults leak at the edges. It is the wrong tool, not a sin.
- **You still may not** render a native `<button>`, `<input>`, `<select>`, `<textarea>`, a `title`
  tooltip, `alert/confirm/prompt` or the native right-click menu outside `src/components/ui/`. The lint
  gate in `check:all` rejects it — and it always did. **The gate never banned libraries; only the prose
  did.** Nothing about your build changes.

## What you must do

**Nothing mechanical.** No file in your project layer has to change, and `check:all` behaves exactly as
before. What changes is what you are allowed to *reason* your way to: if you previously skipped a
headless dependency because "component libraries are banned", that reason is gone. The bar it was
protecting — nothing stock ever reaches a view — is unchanged and still gated.

## Why

The maintainer's requirement was always: *an app built on saga must use no standard UI elements and must
bring every element into line with the saga UI itself.* The governance encoded a side-effect of that
("no libraries") as if it were the rule, and in the core at that — where **which dependencies a project
may use** is not even a portable question to answer.
