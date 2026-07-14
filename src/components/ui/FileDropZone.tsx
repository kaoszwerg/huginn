import { useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

interface FileDropZoneProps {
  /** Called with the dropped file paths that match `extensions` (all, if none given). */
  onDrop: (paths: string[]) => void;
  /** Allowed extensions without the dot, e.g. `["bin"]`. Pass a stable reference. */
  extensions?: string[];
  /** Ignore drops while true (e.g. an import already running). */
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * A drag-and-drop file target, styled as a HUD primitive (ADR-APP-026, rule:core-principles §10).
 *
 * This exists **because** the design system forbids a native/unstyled platform control dropped in as-is
 * — and the OS file-open dialog is exactly that. Drag-and-drop is the design-system-compliant way to let
 * the user bring a file in: the surface is ours, styled with our tokens, and it is Tauri's drag-drop
 * event — not a browser dialog — that hands us the real path (a webview's HTML drop would give only a
 * name). The one trade-off is that this has no click-to-browse: that would require the native picker.
 */
export function FileDropZone({
  onDrop,
  extensions,
  disabled = false,
  children,
  className = "",
  ...rest
}: FileDropZoneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    // Tauri reports the pointer in physical pixels; the element's rect is in CSS pixels — convert before
    // deciding whether a drop landed on this zone rather than elsewhere in the window.
    const isOnZone = (pos: { x: number; y: number }) => {
      const el = ref.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = pos.x / dpr;
      const y = pos.y / dpr;
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const allowed = (path: string) =>
      !extensions || extensions.some((e) => path.toLowerCase().endsWith(`.${e.toLowerCase()}`));

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (disabled) {
          setOver(false);
          return;
        }
        if (p.type === "enter" || p.type === "over") {
          setOver(isOnZone(p.position));
        } else if (p.type === "drop") {
          const onZone = isOnZone(p.position);
          setOver(false);
          if (onZone) {
            const paths = p.paths.filter(allowed);
            if (paths.length > 0) onDrop(paths);
          }
        } else {
          setOver(false);
        }
      })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      })
      .catch(() => {
        // No Tauri drag-drop here (e.g. a test environment) — the zone simply stays inert.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onDrop, extensions, disabled]);

  return (
    <div
      ref={ref}
      data-drag-over={over || undefined}
      aria-disabled={disabled || undefined}
      className={`border-line text-dim data-[drag-over]:border-accent data-[drag-over]:text-fg data-[drag-over]:bg-elevated flex flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border border-dashed p-4 text-center text-xs leading-relaxed transition-colors ${disabled ? "opacity-60" : ""} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}
