import type { InputHTMLAttributes } from "react";

/** Single-line text input props — the native `type` and `title` are intentionally not exposed. */
export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "title">;

/**
 * The text input (ADR-APP-026). A raw `<input>` is lint-banned outside `src/components/ui`; every
 * field routes through this, so the surface, the radius and the focus ring are the same everywhere
 * and follow the theme. The focus ring comes from the global `:focus-visible` rule — one ring, one
 * token, no per-component invention.
 *
 * Pass an `aria-label` (or wire a `<label>`): a field without an accessible name is invisible to a
 * screen reader.
 */
export function TextField({ className = "", ...rest }: TextFieldProps) {
  return (
    <input
      type="text"
      className={`bg-elevated text-fg border-line placeholder:text-dim rounded-[var(--radius-control)] border px-2.5 py-1.5 text-xs outline-none ${className}`.trim()}
      {...rest}
    />
  );
}
