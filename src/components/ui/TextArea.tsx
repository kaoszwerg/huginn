import type { TextareaHTMLAttributes } from "react";

/** Multi-line text input props — the native `title` tooltip is intentionally not exposed. */
export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "title">;

/**
 * The multi-line text input (ADR-APP-026). A raw `<textarea>` is lint-banned outside
 * `src/components/ui`; a macro template — which can span several lines — routes through this, so the
 * surface, the radius and the focus ring match every other field and follow the theme. The focus ring
 * comes from the global `:focus-visible` rule — one ring, one token, no per-component invention.
 *
 * Pass an `aria-label` (or wire a `<label>`): a field without an accessible name is invisible to a
 * screen reader.
 */
export function TextArea({ className = "", rows = 3, ...rest }: TextAreaProps) {
  return (
    <textarea
      rows={rows}
      className={`bg-elevated text-fg border-line placeholder:text-dim resize-y rounded-[var(--radius-control)] border px-2.5 py-1.5 text-xs outline-none ${className}`.trim()}
      {...rest}
    />
  );
}
