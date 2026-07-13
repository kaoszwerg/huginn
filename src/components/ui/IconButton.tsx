import type { ButtonHTMLAttributes, ReactNode } from "react";
import { hudButtonClass, type HudAccent } from "./hudButton";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title" | "aria-label"
> {
  /** Accessible name — the icon is decorative, so this is required. Also the default tooltip. */
  label: string;
  /** HUD accent colour (ADR-APP-020). Defaults to cyan. */
  accent?: HudAccent;
  /** Locks the button into its filled state (e.g. the active nav item). */
  active?: boolean;
  /** `solid` (default) is the chamfered neon button; `ghost` is a borderless icon control. */
  variant?: "solid" | "ghost";
  /** Custom HUD tooltip (ADR-APP-026). Defaults to `label`; pass `null` for none (aria-label remains). */
  tooltip?: ReactNode;
}

/**
 * Icon-only button in the HUD design system (ADR-APP-020, ADR-APP-026). Wraps `Button`'s surface but forces
 * an accessible `label` (there is no visible text) and, by default, surfaces that label as a `Tooltip`
 * on hover/focus — replacing the native `title` attribute. Window controls, nav rails and inline
 * icon actions all route through this instead of styling a raw `<button>`.
 */
export function IconButton({
  label,
  accent,
  active,
  variant = "solid",
  tooltip,
  className = "",
  type,
  children,
  ...rest
}: IconButtonProps) {
  const btn = (
    <button
      type={type ?? "button"}
      aria-label={label}
      className={`${hudButtonClass({ accent, active, variant })} flex items-center justify-center ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
  const content = tooltip === undefined ? label : tooltip;
  return content == null ? btn : <Tooltip content={content}>{btn}</Tooltip>;
}
