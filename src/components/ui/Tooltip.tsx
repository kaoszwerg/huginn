import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { FocusEvent, MouseEvent, ReactElement, ReactNode } from "react";

interface TooltipProps {
  /** What the tooltip says. Rendered on hover and keyboard focus; nothing shows when `null`. */
  content: ReactNode;
  /** The single trigger element the tooltip describes (e.g. a `Button`/`IconButton`). */
  children: ReactElement;
}

/** Props the tooltip chains onto its trigger — existing handlers are preserved, not overwritten. */
interface TriggerProps {
  onMouseEnter?: (e: MouseEvent<Element>) => void;
  onMouseLeave?: (e: MouseEvent<Element>) => void;
  onFocus?: (e: FocusEvent<Element>) => void;
  onBlur?: (e: FocusEvent<Element>) => void;
  "aria-describedby"?: string;
}

/**
 * The tooltip (ADR-APP-026): the replacement for the native `title` attribute, whose OS-drawn bubble
 * is a stock element we do not ship. Shows a quiet popover on hover **and on keyboard focus**, links
 * it to the trigger via `aria-describedby`, and dismisses on blur, pointer-leave or Escape.
 *
 * Layout-neutral: it clones the single child trigger and attaches handlers rather than wrapping it in
 * a box, so it never disturbs a flex/grid parent. The popover renders through a portal so a parent's
 * `clip-path` can't crop it, and is `pointer-events: none` so it never eats a click.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isValidElement(children)) return children;

  const show = (e: MouseEvent<Element> | FocusEvent<Element>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.round(r.left + r.width / 2) });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  const childProps = (children.props ?? {}) as TriggerProps;
  const trigger = cloneElement(children as ReactElement<TriggerProps>, {
    onMouseEnter: (e: MouseEvent<Element>) => {
      childProps.onMouseEnter?.(e);
      show(e);
    },
    onMouseLeave: (e: MouseEvent<Element>) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: FocusEvent<Element>) => {
      childProps.onFocus?.(e);
      show(e);
    },
    onBlur: (e: FocusEvent<Element>) => {
      childProps.onBlur?.(e);
      hide();
    },
    "aria-describedby": open ? id : childProps["aria-describedby"],
  });

  return (
    <>
      {trigger}
      {open && content != null
        ? createPortal(
            <div
              role="tooltip"
              id={id}
              className="surface-popover text-fg pointer-events-none fixed z-[70] max-w-[240px] -translate-x-1/2 px-2 py-1 text-xs whitespace-nowrap"
              style={{ top: pos.top, left: pos.left }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
