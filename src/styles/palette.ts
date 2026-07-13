// SSOT for colours used in JavaScript: the few places that can't resolve CSS `var()` (canvas,
// inline styles, level-coloured log lines). Mirrors the HUD palette in globals.css (:root + the
// @theme tokens). Change a colour here AND in globals.css :root — those are the only two places
// (className utilities use the @theme tokens, which reference :root, so they need no change).
export const PALETTE = {
  fg: "#e0e0e0",
  dim: "#9aa4b2",
  cyan: "#00e5ff",
  green: "#00ff88",
  gold: "#ffd700",
  purple: "#b44aff",
  danger: "#ff3366",
  deep: "#0a0a0f",
  surface: "#12121a",
  elevated: "#1a1a2e",
} as const;
