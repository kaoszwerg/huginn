import type { ButtonHTMLAttributes, ReactNode } from "react";
import { controlClass, type ControlVariant, type Tone } from "./controlClass";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title" | "aria-label"
> {
  /** Accessible name. Required: the icon carries no text, so without this the control is unnamed. */
  label: string;
  tone?: Tone;
  /** Defaults to `ghost` — an icon control usually sits in a strip and should not carry a surface. */
  variant?: ControlVariant;
  active?: boolean;
  /** Defaults to `label`. Pass `null` for no tooltip (the accessible name remains). */
  tooltip?: ReactNode;
}

/**
 * The icon-only button (ADR-APP-026). Same surface as `Button`, but it forces an accessible `label`
 * and surfaces that label as a `Tooltip` on hover and on keyboard focus — replacing the native
 * `title` attribute, whose OS-drawn bubble is a stock element we do not ship.
 */
export function IconButton({
  label,
  tone,
  variant = "ghost",
  active,
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
      className={`${controlClass({ tone, variant, active })} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
  const content = tooltip === undefined ? label : tooltip;
  return content == null ? btn : <Tooltip content={content}>{btn}</Tooltip>;
}
