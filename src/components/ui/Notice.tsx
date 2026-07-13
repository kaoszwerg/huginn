import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export type NoticeTone = "info" | "warning" | "danger" | "success";

interface NoticeProps {
  tone?: NoticeTone;
  /** What happened, in the user's words. */
  children: ReactNode;
  /** The way out — a button that fixes it. A notice that only complains is half a feature. */
  action?: ReactNode;
  className?: string;
}

/**
 * An in-app message (ADR-APP-026). This is the primitive that exists so a failure can be **shown**
 * rather than logged: `alert()` is a stock OS dialog and is lint-banned, and a line in a log file is
 * not a message to a user — nobody reads it.
 *
 * It is used for the failures a user must act on: the push-to-talk hotkey that could not be
 * registered because another application already holds it (rule:overlay-and-input), a model whose
 * checksum did not match, a text insertion that did not reach its target.
 *
 * `role="status"` (not `alert`) keeps it announced without hijacking the screen reader mid-sentence;
 * it is a standing condition, not an interruption.
 */
export function Notice({ tone = "info", children, action, className = "" }: NoticeProps) {
  const { Icon, colour } = look(tone);
  return (
    <div
      role="status"
      className={`surface-panel flex items-start gap-3 p-3 text-xs ${className}`.trim()}
      style={{ borderColor: colour }}
    >
      <Icon size={16} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: colour }} />
      <div className="text-fg flex-1 leading-relaxed">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Icon and colour per tone. The colour is a design token, never a hex — it has to resolve in both
 * themes (rule:design-system). An exhaustive `switch`, so a new tone cannot be added without giving
 * it a look.
 */
function look(tone: NoticeTone): { Icon: typeof Info; colour: string } {
  switch (tone) {
    case "info":
      return { Icon: Info, colour: "var(--huginn-accent)" };
    case "warning":
      return { Icon: AlertTriangle, colour: "var(--huginn-warning)" };
    case "danger":
      return { Icon: AlertTriangle, colour: "var(--huginn-danger)" };
    case "success":
      return { Icon: CheckCircle2, colour: "var(--huginn-success)" };
  }
}
