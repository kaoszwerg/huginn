import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { HotkeyField } from "../components/ui/HotkeyField";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";
import { useHotkeyStatus, useSetHotkey } from "../hooks/useHotkey";
import { useAutostart, useSetAutostart } from "../hooks/useAutostart";
import type { ThemeChoice } from "../bindings/ThemeChoice";

const UI_SCALES = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5] as const;

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "Follow system" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** Settings: the recording hotkey, the appearance, and what the close button does. */
export function SettingsView() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const hotkey = useHotkeyStatus();
  const setHotkey = useSetHotkey();
  const autostart = useAutostart();
  const setAutostart = useSetAutostart();

  const scale = settings.data?.ui_scale ?? 1;
  const theme = settings.data?.theme ?? "system";
  const minimizeToTray = settings.data?.minimize_to_tray ?? false;
  const shortcut = hotkey.data?.shortcut ?? settings.data?.hotkey ?? "Ctrl+Space";

  return (
    <div className="h-full space-y-4 overflow-auto p-6">
      <Panel
        label="Recording"
        info={
          <p>
            Hold the combination to record, release it to insert the text into whatever application
            you were working in. A global shortcut is exclusive: while Huginn holds it, no other
            application receives it.
          </p>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-fg text-sm">Push-to-talk</span>
              <span className="text-dim text-xs">Hold to speak, release to insert.</span>
            </div>
            <HotkeyField
              value={shortcut}
              busy={setHotkey.isPending}
              onChange={(spec) => setHotkey.mutate(spec)}
            />
          </div>

          {/* The failure the user must see: without this key, the product does nothing at all. */}
          {hotkey.data && !hotkey.data.registered ? (
            <Notice tone="danger">
              <strong className="text-fg">Push-to-talk is not active.</strong>{" "}
              {hotkey.data.error ?? "The combination could not be registered."} Choose another
              combination above.
            </Notice>
          ) : null}

          {hotkey.data?.registered && setHotkey.isSuccess ? (
            <Notice tone="success">Push-to-talk is armed.</Notice>
          ) : null}
        </div>
      </Panel>

      <Panel label="Appearance">
        <div className="flex flex-col gap-4">
          <Field label="Theme" hint="Huginn follows your desktop unless you tell it otherwise.">
            <div className="flex flex-wrap gap-1">
              {THEMES.map((t) => (
                <Button
                  key={t.id}
                  variant="ghost"
                  aria-pressed={theme === t.id}
                  active={theme === t.id}
                  onClick={() => update.mutate({ theme: t.id })}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </Field>

          <Field label="Interface size">
            <div className="flex flex-wrap gap-1">
              {UI_SCALES.map((s) => (
                <Button
                  key={s}
                  variant="ghost"
                  aria-pressed={Math.abs(scale - s) < 0.001}
                  active={Math.abs(scale - s) < 0.001}
                  onClick={() => update.mutate({ uiScale: s })}
                  className="font-mono"
                >
                  {Math.round(s * 100)}%
                </Button>
              ))}
            </div>
          </Field>
        </div>
      </Panel>

      <Panel
        label="Background"
        info={
          <p>
            Huginn is a background tool: the hotkey works from any application, but only while
            Huginn is running. It always keeps a tray icon — that is how you open it again, and how
            you quit it.
          </p>
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            label="Start with the system"
            hint="Off by default. Nothing adds itself to your startup unasked."
          >
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                aria-pressed={autostart.data === true}
                active={autostart.data === true}
                disabled={setAutostart.isPending}
                onClick={() => setAutostart.mutate(true)}
              >
                On
              </Button>
              <Button
                variant="ghost"
                aria-pressed={autostart.data === false}
                active={autostart.data === false}
                disabled={setAutostart.isPending}
                onClick={() => setAutostart.mutate(false)}
              >
                Off
              </Button>
            </div>
            {setAutostart.isError ? (
              <Notice tone="danger" className="mt-2">
                The system refused to change the startup entry.{" "}
                {setAutostart.error instanceof Error ? setAutostart.error.message : ""}
              </Notice>
            ) : null}
          </Field>

          <Field
            label="Closing the window"
            hint="Closing the window does not stop dictation unless you say so — the hotkey needs Huginn to be running."
          >
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                aria-pressed={minimizeToTray}
                active={minimizeToTray}
                onClick={() => update.mutate({ minimizeToTray: true })}
              >
                Keep listening in the tray
              </Button>
              <Button
                variant="ghost"
                aria-pressed={!minimizeToTray}
                active={!minimizeToTray}
                onClick={() => update.mutate({ minimizeToTray: false })}
              >
                Quit Huginn
              </Button>
            </div>
          </Field>
        </div>
      </Panel>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-fg text-sm">{label}</span>
      {children}
      {hint ? <span className="text-dim text-xs">{hint}</span> : null}
    </div>
  );
}
