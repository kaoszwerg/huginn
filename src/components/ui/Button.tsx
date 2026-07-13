import type { ButtonHTMLAttributes, ReactNode } from "react";
import { hudButtonClass, type HudAccent } from "./hudButton";
import { Tooltip } from "./Tooltip";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** HUD accent colour (ADR-APP-020). Defaults to cyan. */
  accent?: HudAccent;
  /** Locks the button into its filled state (e.g. the selected item in a toggle group). */
  active?: boolean;
  /** `solid` (default) is the chamfered neon button; `ghost` is a borderless text control. */
  variant?: "solid" | "ghost";
  /** Custom HUD tooltip (ADR-APP-026 — never the native `title`). Omit for none. */
  tooltip?: ReactNode;
}

/**
 * Text/label button in the HUD design system (ADR-APP-020, ADR-APP-026). Every clickable control routes
 * through this primitive — a raw, unstyled `<button>` is banned outside `src/components/ui` — so the
 * chamfer, neon fill, hover and active states stay identical everywhere. `type` defaults to
 * `"button"` so a button in a form never submits by accident.
 */
export function Button({
  accent,
  active,
  variant,
  tooltip,
  className = "",
  type,
  children,
  ...rest
}: ButtonProps) {
  const btn = (
    <button
      type={type ?? "button"}
      className={`${hudButtonClass({ accent, active, variant })} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
  return tooltip == null ? btn : <Tooltip content={tooltip}>{btn}</Tooltip>;
}
