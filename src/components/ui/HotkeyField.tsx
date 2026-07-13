import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { humaniseShortcut, toShortcutSpec } from "./shortcut";

interface HotkeyFieldProps {
  /** The combination currently in force. */
  value: string;
  /** Called with the new combination once the user has pressed one. */
  onChange: (spec: string) => void;
  /** Disables recording while a change is in flight. */
  busy?: boolean;
}

/**
 * The hotkey recorder (ADR-APP-026). Click, press the combination, done.
 *
 * Not a text field where the user types the combination by hand — that would be a spelling test —
 * and not a dropdown of blessed combinations, which would be a lie: whether a shortcut can be
 * registered is the operating system's call, and it is answered by trying.
 *
 * While recording it swallows the keystroke (`preventDefault`), so pressing `Ctrl+S` to record it
 * does not also trigger whatever `Ctrl+S` does behind this window. Escape cancels and changes
 * nothing.
 */
export function HotkeyField({ value, onChange, busy = false }: HotkeyFieldProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const stop = useCallback(() => setRecording(false), []);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // The recorder owns the keyboard while it is open; nothing behind it may react.
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        stop();
        return;
      }
      const spec = toShortcutSpec(e);
      if (!spec) return; // still only modifiers — keep waiting

      stop();
      onChange(spec);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [recording, onChange, stop]);

  if (recording) {
    return (
      <div className="flex items-center gap-2">
        <span
          role="status"
          className="border-accent text-accent rounded-[var(--radius-control)] border border-dashed px-3 py-1.5 text-xs"
        >
          {t("hotkey.recordPrompt")}
        </span>
        <Button variant="ghost" onClick={stop}>
          {t("hotkey.cancel")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <kbd className="bg-elevated border-line text-fg rounded-[var(--radius-control)] border px-3 py-1.5 text-xs">
        {humaniseShortcut(value)}
      </kbd>
      <Button
        onClick={() => setRecording(true)}
        disabled={busy}
        tooltip={t("hotkey.recordTooltip")}
      >
        {t("hotkey.change")}
      </Button>
    </div>
  );
}
