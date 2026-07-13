/**
 * The one place a control's surface is defined (ADR-PROJ-003, ADR-APP-026, ADR-CORE-005).
 *
 * Every interactive control in Huginn — button, icon button, nav item, field — renders through this,
 * so a "primary" button in the settings view and one in a dialog are the same object, not two
 * lookalikes that drift apart on the next change.
 *
 * **Tone is a role, never a hue.** Huginn has exactly one accent; the other tones are semantic
 * (destructive, quiet). A caller asking for "the blue one" would be naming a colour, and colours are
 * a theme's business — the same control must work on a light ground and a dark one.
 */

/** What the control *means* — not what colour it happens to be in the current theme. */
export type Tone = "accent" | "neutral" | "danger";

/**
 * How present the control is:
 * - `solid` — the primary action of its context. One per view, at most.
 * - `outline` — a secondary action: visible, bordered, quiet.
 * - `ghost` — an inline action; no surface at rest, so it can sit in a strip or a row of text.
 */
export type ControlVariant = "solid" | "outline" | "ghost";

export interface ControlStyle {
  tone?: Tone;
  variant?: ControlVariant;
  /** Locks the control into its selected state (a nav item, a filter that is on). */
  active?: boolean;
}

/** Shared by every variant: shape, focus, motion, and the disabled state. */
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] " +
  "transition-colors duration-100 disabled:pointer-events-none disabled:opacity-45";

/**
 * The surface per variant and tone.
 *
 * Written as exhaustive `switch`es rather than lookup objects on purpose: the compiler then proves
 * every combination is handled — add a tone and this stops compiling instead of silently returning
 * `undefined` and rendering an unstyled control.
 */
function surfaceClass(variant: ControlVariant, tone: Tone): string {
  switch (variant) {
    case "solid":
      switch (tone) {
        // The label on the accent uses `on-accent`, a token that flips with the theme: the accent is
        // light on a dark ground and dark on a light one, so a fixed white or black would fail in
        // one of the two.
        case "accent":
          return "bg-accent text-on-accent hover:bg-accent-strong";
        case "danger":
          return "bg-danger text-bg hover:opacity-90";
        case "neutral":
          return "bg-elevated text-fg border border-line hover:border-dim";
      }
      break;
    case "outline":
      switch (tone) {
        case "accent":
          return "border border-accent text-accent hover:bg-accent/10";
        case "danger":
          return "border border-danger text-danger hover:bg-danger/10";
        case "neutral":
          return "border border-line text-fg hover:bg-elevated";
      }
      break;
    case "ghost":
      switch (tone) {
        case "accent":
          return "text-accent hover:bg-elevated";
        case "danger":
          return "text-dim hover:bg-danger/10 hover:text-danger";
        case "neutral":
          return "text-dim hover:bg-elevated hover:text-fg";
      }
      break;
  }
  // Unreachable while `Tone` and `ControlVariant` are exhaustive — kept so a future variant added
  // without its surface fails loudly in review rather than rendering a naked button.
  return "";
}

/** The selected state, per variant. `solid` is already filled, so it deepens rather than fills. */
function activeClass(variant: ControlVariant): string {
  switch (variant) {
    case "solid":
      return "bg-accent-strong";
    case "outline":
      return "bg-accent/15 text-accent border-accent";
    case "ghost":
      return "bg-elevated text-accent";
  }
}

/**
 * Build the class string for a control surface.
 *
 * Layout (size, padding, width) is *not* decided here — that belongs to the call site, which knows
 * whether it is drawing a 28px window control or a full-width button.
 */
export function controlClass({
  tone = "neutral",
  variant = "solid",
  active = false,
}: ControlStyle = {}): string {
  return `${BASE} ${surfaceClass(variant, tone)}${active ? ` ${activeClass(variant)}` : ""}`;
}
