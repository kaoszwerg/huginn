import { useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton } from "./IconButton";

interface PanelProps {
  /** Quiet section heading. Omit for an unlabelled container. */
  label?: string;
  /** Optional documentation, surfaced behind an "i" button: what this shows, how to read it. */
  info?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The content container (ADR-PROJ-003). A bordered surface with a hairline and a quiet radius —
 * no chamfer, no glow, no animated frame. Content blocks live in one of these; the panel itself
 * carries no colour of its own, so it reads the same in both themes.
 */
export function Panel({ label, info, className = "", children }: PanelProps) {
  return (
    <section className={`surface-panel p-4 ${className}`.trim()}>
      {label || info ? (
        <div className="mb-3 flex items-start justify-between gap-2">
          {label ? <h2 className="label-caps">{label}</h2> : <span />}
          {info ? <InfoButton info={info} /> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * The "i" affordance: a doc popover, rendered through a portal so a parent's `overflow` cannot crop
 * it. Closes on outside click or Escape. The trigger is the shared `IconButton` primitive — never a
 * raw button, never a native tooltip (ADR-APP-026).
 */
function InfoButton({ info }: { info: ReactNode }) {
  const { t } = useTranslation();
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
        label={t("panel.whatIsThis")}
        tooltip={null}
        onClick={toggle}
        active={open}
        className="h-6 w-6 shrink-0"
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
                className="surface-popover text-dim fixed z-[61] w-[300px] p-3 text-xs leading-relaxed"
                style={{ top: pos.top, left: pos.left }}
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
