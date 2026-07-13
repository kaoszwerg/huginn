---
id: ADR-PROJ-003
title: Huginn's visual identity replaces the template's HUD look
status: accepted
tldr: "The neon HUD inherited from saga is not Huginn's: calm and restrained instead. The mechanism (colour SSOT, own primitives, ui-boundary gate) is kept unchanged."
scope: frontend
load: conditional
triggers: [design, look, theme, palette, hud, overlay, brand, icon, font, colour, color, ui]
applies-to: ["src/styles/**", "src/components/**", "src-tauri/icons/**"]
supersedes: [ADR-APP-020]
superseded-by: null
---

## Context

Huginn was created from `saga-rust-template`, whose design system (ADR-APP-020) is a deliberately loud
one: near-black background, neon cyan/green/gold accents, `clip-path` chamfered corners, Orbitron
display type. It is a good HUD. It is the **opposite** of what Huginn must be.

Huginn sits in the corner of someone else's screen while they work, and it is sold on discretion. The
product brief is explicit: professional, calm, restrained, "nordic" only in the sense of reduction —
no viking clichés, no runes as body type, no neon, no fantasy. A recording indicator that demands
attention is a defect, not a style.

The *mechanism* the template brings, by contrast, is exactly right and is kept verbatim: one colour SSOT
(`globals.css` `:root` + `@theme` tokens, mirrored in `palette.ts`; raw hex nowhere else), every control
a reusable primitive the project owns (`src/components/ui/**`), and the `ui-boundary` gate that makes
"no stock UI, ever" a build failure rather than a wish (ADR-APP-026).

## Decision

- **Huginn's design system is its own.** The look is calm, quiet and high-contrast where it must be
  legible, and nowhere else. The raven may be referenced subtly (a reduced silhouette, a feather, a
  wing-shaped waveform); never a helmet, a rune, or a glow.
- **The overlay is a quiet indicator.** It sits over the user's real work. It states the state
  ("listening", "working", "inserted") and gets out of the way. It is not a second theme: it is the same
  token set and the same primitives at a smaller scale, on a transparent background.
- **The mechanism is inherited unchanged.** Colour lives in two mirrored files and nowhere else; every
  interactive control is a primitive in `src/components/ui/**`; every runtime dependency is classified in
  `ui-boundary.json` and a UI library may only ever sit *under* a primitive, never in a view.
- **The template's design decision is retired, not edited.** This ADR declares
  `supersedes: [ADR-APP-020]`, and `rule:design-system` declares `supersedes: [rule:theming]`
  (ADR-CORE-035). The upstream files stay pinned and untouched — but the generated indexes mark them
  superseded, and `context-for.mjs` stops handing them to an agent altogether. The same applies to
  `mem:glossary`, retired by `mem:huginn-glossary`. Nobody has to read a paragraph explaining that a
  document does not count; they simply never receive it.
- **The inherited palette is a release blocker.** Until Huginn's own design lands, the repo carries
  saga's values as visible placeholders — `release:check` refuses a release build while that is true
  (ADR-PROJ-002). No new UI may deepen the debt: nothing new is built *in* the HUD style.

## Alternatives

- **Opting the upstream documents out of the pin and rewriting them** — rejected, and no longer necessary.
  Owning a file is not how you decline a decision: `supersedes` retires it while the file keeps receiving
  upstream fixes (ADR-CORE-035). (This ADR was originally written when that mechanism did not exist; the
  workaround — a parallel rule whose first paragraph said "the pinned one does not apply" — is gone.)
- **Keep saga's HUD look** — rejected: it contradicts the product outright.
- **Adopt a component library and restyle it** — permitted by the rules (a library may sit under a
  primitive), but rejected for the *look*: fighting a kit's skin and reset costs more than drawing a
  restrained design, and its defaults leak at the edges. A **headless** library (behaviour, focus
  management, positioning) remains a legitimate foundation — classified `primitiveOnly` in
  `ui-boundary.json`, importable only inside `src/components/ui/**`.

## Consequences

- The visual design is real work and is on the plan, not assumed away (`PLAN.md`).
- Until it lands, the app looks like the template. That is stated in `rule:theming`, `mem:glossary` and
  the release gate — it is visible debt, not hidden debt.
- Icons (`src-tauri/icons/`) are regenerated as part of the design work, not before it.

## References

- ADR-APP-020 (the template's HUD — not ours), ADR-APP-026 (no stock UI, the ui-boundary gate),
  ADR-PROJ-002 (release blockers), ADR-PROJ-004 (the overlay), rule:design-system, rule:ui-design.
