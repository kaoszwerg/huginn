---
id: ADR-APP-020
title: HUD design system — palette, chamfers, neon panels, no charting library
status: accepted
tldr: "One HUD design system: palette in :root + Tailwind @theme tokens, clip-path chamfers, neon panels/buttons, Orbitron/Inter fonts; no charting library."
scope: frontend
load: conditional
triggers: [ui, hud, design, theme, canvas, dashboard, color]
applies-to: ["src/styles/**", "src/components/**", "src/views/**"]
supersedes: []
superseded-by: null
---

## Context

The UI is visually consistent with the maintainer's other projects: a dark HUD look with chamfered
panels and neon accents. It has to stay coherent as views are added, which means the design lives in
shared primitives rather than in per-view CSS.

## Decision

The HUD design system is defined once in `src/styles/globals.css`: the palette as CSS variables in
`:root`, exposed as Tailwind colour tokens through an `@theme inline` block; `clip-path` chamfered
corners (`hud-clip` / `hud-clip-sm`); neon panels, buttons and labels
(`hud-panel` / `hud-btn` / `hud-label` / `hud-grid-bg` / `hud-accent-*`); the fonts Inter,
JetBrains Mono and Orbitron. JavaScript that cannot resolve a CSS `var()` (canvas, inline styles)
imports the mirrored hex from `src/styles/palette.ts` (ADR-CORE-005). Views compose `HudPanel` — they do
not restyle.

**No charting library ships in the shell.** If a feature needs charts, the library is chosen then, in
its own ADR, so the shell stays light.

## Alternatives

- **A component library (MUI, shadcn, …)** — rejected: it would fight the HUD look and add weight for
  primitives we already have.
- **Per-view CSS** — rejected: the look drifts view by view and colours end up hardcoded.

## Consequences

- Consistent HUD look across views; a new view inherits it for free.
- Exactly two files may contain raw hex (`globals.css`, `palette.ts`); everything else uses tokens.

## References

- ADR-APP-021 (window chrome), `.claude/rules/theming.md`, `.claude/rules/ui-design.md`.
