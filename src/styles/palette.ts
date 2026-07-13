/**
 * The JavaScript view of the design tokens (ADR-PROJ-003, rule:design-system).
 *
 * **These are `var()` references, not hex values, and that is deliberate.** Huginn has two themes;
 * a hex frozen into a JS constant would be correct in one of them and wrong in the other — and the
 * bug would only appear on machines set to the theme nobody tested. Handing the *token* to the
 * browser lets it resolve the colour at paint time, in whatever theme is live.
 *
 * The colours themselves live in exactly one place: `globals.css` `:root`. This file names them; it
 * does not own them.
 *
 * A call site that genuinely cannot resolve a `var()` — a canvas, which needs a real colour string —
 * reads the computed value at paint time:
 *
 * ```ts
 * const ink = getComputedStyle(document.documentElement).getPropertyValue("--huginn-text");
 * ```
 *
 * …and re-reads it when the theme changes. It does not hardcode the hex.
 */
export const PALETTE = {
  bg: "var(--huginn-bg)",
  surface: "var(--huginn-surface)",
  elevated: "var(--huginn-elevated)",
  line: "var(--huginn-border)",
  fg: "var(--huginn-text)",
  dim: "var(--huginn-text-dim)",
  accent: "var(--huginn-accent)",
  danger: "var(--huginn-danger)",
  success: "var(--huginn-success)",
  warning: "var(--huginn-warning)",
} as const;
