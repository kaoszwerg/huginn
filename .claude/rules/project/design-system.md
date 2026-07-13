---
id: rule:design-system
title: Huginn's design system
tldr: "Calm and restrained, never the template's neon HUD. Colour lives only in globals.css :root + palette.ts; every control is a primitive in src/components/ui/**."
scope: frontend
load: conditional
triggers:
  [
    design,
    theme,
    theming,
    color,
    colour,
    palette,
    token,
    css,
    style,
    font,
    look,
    hud,
    overlay,
    icon,
    component,
    primitive,
    ui,
  ]
applies-to: ["src/styles/**", "src/components/**", "src-tauri/icons/**"]
supersedes: [rule:theming]
---

# Huginn's design system (ADR-PROJ-003)

## What Huginn looks like

Calm, professional, restrained; high contrast only where legibility demands it. The raven may be
referenced subtly — a reduced silhouette, a feather, a wing-shaped waveform. Never neon, never chamfers,
never runes as body type, never a gaming HUD.

**The recording overlay sits on top of someone else's work.** It states the state ("listening",
"working", "inserted") and gets out of the way. An overlay that wants attention is a defect, not a style.

## The mechanism (inherited from the template — this part is right)

- **Colour lives in exactly two mirrored files, and nowhere else:**
  - `src/styles/globals.css` `:root` — the palette as CSS variables, prefixed **`--huginn-*`**, exposed as
    Tailwind tokens via `@theme inline`. Use the tokens in `className`; inline styles use
    `var(--huginn-*)`.
  - `src/styles/palette.ts` (`PALETTE`) mirrors the same hex for JavaScript (canvas, inline styles that
    cannot resolve a CSS `var()`).
  - **Raw hex anywhere else is a defect**, not a shortcut.
- **Every interactive control is a primitive** in `src/components/ui/**` — never a raw element styled at
  the call site, never a library component wearing its own appearance (ADR-APP-026). The `ui-boundary`
  gate in `npm run lint` enforces it: a package that renders UI is `primitiveOnly` in `ui-boundary.json`
  and may only be imported inside `src/components/ui/**`.
- **A headless library is a legitimate foundation** — behaviour, focus management, positioning — as long
  as it sits *under* a primitive and none of its own look escapes that layer.
- **Shape and elevation are shared utilities**, defined once and reused; never reinvented per component
  (ADR-CORE-005).

## The state of the repo right now

**The colours in `globals.css` are still the template's.** They are inherited placeholders and a tracked
**release blocker** (`npm run release:check`, ADR-PROJ-002). Do not build new UI in that style and do not
deepen the debt: what exists is being replaced, not extended.

## One system, two surfaces

The settings window and the recording overlay are **one** design system with **one** token set. The
overlay is not a second theme — it is the same primitives, smaller, on a transparent background
(ADR-PROJ-004).
