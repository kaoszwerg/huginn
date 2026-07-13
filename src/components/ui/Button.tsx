import type { ButtonHTMLAttributes, ReactNode } from "react";
import { controlClass, type ControlVariant, type Tone } from "./controlClass";
import { Tooltip } from "./Tooltip";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  /** What the action means (ADR-PROJ-003): the accent, a destructive action, or a quiet one. */
  tone?: Tone;
  /** How present it is. Defaults to `outline` — a solid button is the one primary action of a view. */
  variant?: ControlVariant;
  /** Locks the button into its selected state (e.g. the on filter in a toggle group). */
  active?: boolean;
  /** Tooltip text (ADR-APP-026 — never the native `title`, whose OS bubble is a stock element). */
  tooltip?: ReactNode;
}

/**
 * The text button (ADR-APP-026). Every clickable control routes through this primitive — a raw
 * `<button>` is lint-banned outside `src/components/ui` — so shape, focus ring, hover and disabled
 * states stay identical everywhere and follow the theme.
 *
 * `type` defaults to `"button"`: a button inside a form must never submit it by accident.
 */
export function Button({
  tone,
  variant = "outline",
  active,
  tooltip,
  className = "",
  type,
  children,
  ...rest
}: ButtonProps) {
  const btn = (
    <button
      type={type ?? "button"}
      className={`${controlClass({ tone, variant, active })} px-3 py-1.5 text-xs ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
  return tooltip == null ? btn : <Tooltip content={tooltip}>{btn}</Tooltip>;
}
