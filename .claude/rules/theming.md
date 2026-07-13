---
id: rule:theming
title: Theming
tldr: "Colour SSOT: globals.css :root + @theme tokens for classNames; palette.ts mirrors the hex for canvas/inline use. Never hardcode hex outside those two files."
scope: frontend
load: conditional
triggers: [theme, color, hud, css, style, palette]
applies-to: ["src/styles/**", "src/**/theme*"]
---

# Theming (ADR-APP-020)

- **Colour SSOT (two mirrored places, nothing else):**
  - `src/styles/globals.css` `:root` holds the palette as CSS variables (`--saga-*`); an `@theme inline`
    block exposes them as Tailwind colour tokens (`text-fg`, `text-dim`, `text-cyan`, `bg-elevated`, ...).
    Use those tokens in `className`, never raw hex. Inline DOM styles use `var(--saga-*)`.
  - `src/styles/palette.ts` (`PALETTE`) mirrors the same hex for **JavaScript** use — canvas rendering
    and the few inline styles that cannot resolve CSS `var()`. Keep it in sync with `:root`. These are
    the **only two** files allowed to contain raw hex.
- HUD palette: bg `#0a0a0f`/`#12121a`/`#1a1a2e`; accents cyan `#00e5ff`, green `#00ff88`, gold `#ffd700`,
  purple `#b44aff`, danger `#ff3366`; text `#e0e0e0`/`#9aa4b2`. Fonts: Inter, JetBrains Mono, Orbitron.
- Chamfered corners (`clip-path`) and neon glow are CSS utilities (`.hud-clip*`, `.hud-panel`, `.hud-btn`) —
  reuse them, do not reinvent per component.
