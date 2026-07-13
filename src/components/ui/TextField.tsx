import type { InputHTMLAttributes } from "react";

/** Single-line text input props — the native `type` and `title` are intentionally not exposed. */
export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "title">;

/**
 * Single-line text input in the HUD design system (ADR-APP-026). A raw `<input>` is banned outside
 * `src/components/ui`; every text field routes through this so the chamfered surface and the neon
 * focus ring (in place of the native focus outline) stay consistent. Pass an `aria-label` (or wire a
 * `<label>`) so the field has an accessible name.
 */
export function TextField({ className = "", ...rest }: TextFieldProps) {
  return (
    <input
      type="text"
      className={`hud-clip-sm bg-elevated text-fg focus:ring-cyan/60 px-2 py-1 text-xs outline-none focus:ring-1 ${className}`.trim()}
      {...rest}
    />
  );
}
