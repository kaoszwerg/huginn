/** The five HUD accent colours (ADR-APP-020). One source for every interactive HUD primitive, so a
 * button, panel and popover that call themselves "cyan" mean the exact same token. */
export type HudAccent = "cyan" | "green" | "gold" | "purple" | "danger";

/** Visual surface of a HUD control: the chamfered neon `solid` button, or a borderless `ghost`
 * text/icon control that only shifts colour on hover. */
export interface HudButtonStyle {
  accent?: HudAccent;
  active?: boolean;
  variant?: "solid" | "ghost";
}

/**
 * Tailwind class string for a HUD button surface (ADR-APP-020, ADR-APP-026). Centralised so `Button`,
 * `IconButton` and any future control render an identical surface instead of each re-deriving the
 * `.hud-btn` / `.hud-clip-sm` / accent combination.
 *
 * - `solid` (default): chamfered neon button; `active` locks it into the filled hover state.
 * - `ghost`: no chamfer or fill — a text/icon control that brightens to cyan on hover, for status
 *   strips and inline actions. Layout/colour-at-rest classes come from the caller's `className`.
 */
export function hudButtonClass({
  accent = "cyan",
  active = false,
  variant = "solid",
}: HudButtonStyle = {}): string {
  if (variant === "ghost") {
    return `transition-colors hover:text-cyan${active ? " text-cyan" : ""}`;
  }
  return `hud-clip-sm hud-btn hud-accent-${accent}${active ? " hud-btn-active" : ""}`;
}
