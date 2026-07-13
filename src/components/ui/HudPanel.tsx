import { useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { IconButton } from "./IconButton";
import type { HudAccent } from "./hudButton";

interface HudPanelProps {
  accent?: HudAccent;
  label?: string;
  /** Optional documentation shown via an "i" button (what it shows, how it's computed/interpreted). */
  info?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** An "i" button that opens a small doc popover. Rendered via a portal so the panel's clip-path /
 * overflow can't clip it; closes on outside-click or Escape. The trigger is the shared `IconButton`
 * HUD primitive (ADR-APP-026) — no raw button, no native tooltip. */
function InfoButton({ info }: { info: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    if (!open) {
      const r = e.currentTarget.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 300) });
    }
    setOpen((o) => !o);
  };
  return (
    <>
      <IconButton
        label="What is this?"
        variant="ghost"
        tooltip={null}
        onClick={toggle}
        className="text-dim shrink-0"
      >
        <Info size={14} strokeWidth={2} />
      </IconButton>
      {open
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[60]"
                onClick={() => setOpen(false)}
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
                role="presentation"
              />
              <div
                className="hud-clip-sm bg-elevated text-dim fixed z-[61] w-[300px] p-3 text-xs leading-relaxed shadow-lg"
                style={{
                  top: pos.top,
                  left: pos.left,
                  boxShadow: "0 0 0 1px rgb(var(--huginn-neon-cyan-rgb) / 0.3)",
                }}
              >
                {info}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Chamfered HUD panel (saga design, ADR-APP-020). The neon border + inner glow come from the `.hud-panel`
 * / `.hud-clip` CSS; content sits above the pseudo-element layers. An optional `info` doc popover is
 * surfaced via an "i" button in the header.
 */
export function HudPanel({
  accent = "cyan",
  label,
  info,
  className = "",
  children,
}: HudPanelProps) {
  return (
    <div className={`hud-panel hud-clip hud-accent-${accent} ${className}`}>
      <div className="relative z-[1] p-4">
        {label || info ? (
          <div className="mb-3 flex items-start justify-between gap-2">
            {label ? <div className="hud-label">{label}</div> : <span />}
            {info ? <InfoButton info={info} /> : null}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
