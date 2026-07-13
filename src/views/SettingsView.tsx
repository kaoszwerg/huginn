import { HudPanel } from "../components/ui/HudPanel";
import { Button } from "../components/ui/Button";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";

const UI_SCALES = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5] as const;

/** Settings view: UI scale and the optional close-to-tray behaviour, persisted to app-data. */
export function SettingsView() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const scale = settings.data?.ui_scale ?? 1;
  const minimizeToTray = settings.data?.minimize_to_tray ?? false;

  return (
    <div className="h-full space-y-4 overflow-auto p-6">
      <HudPanel
        accent="cyan"
        label="Preferences"
        info={
          <p>
            Settings are persisted as JSON under the OS app-data directory and applied to the native
            WebView zoom, so they survive restarts.
          </p>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-dim text-xs">UI scale</span>
            <div className="flex flex-wrap gap-1">
              {UI_SCALES.map((s) => (
                <Button
                  key={s}
                  aria-pressed={Math.abs(scale - s) < 0.001}
                  active={Math.abs(scale - s) < 0.001}
                  onClick={() => update.mutate({ uiScale: s })}
                  className="px-3 py-1 text-xs"
                >
                  {Math.round(s * 100)}%
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-dim text-xs">Close button</span>
            <div className="flex flex-wrap gap-1">
              <Button
                aria-pressed={!minimizeToTray}
                active={!minimizeToTray}
                onClick={() => update.mutate({ minimizeToTray: false })}
                className="px-3 py-1 text-xs"
              >
                Quit app
              </Button>
              <Button
                aria-pressed={minimizeToTray}
                active={minimizeToTray}
                onClick={() => update.mutate({ minimizeToTray: true })}
                className="px-3 py-1 text-xs"
              >
                Minimize to tray
              </Button>
            </div>
            <span className="text-dim text-xs">
              What the window&apos;s close button does. &ldquo;Minimize to tray&rdquo; keeps the app
              running in the system tray with an Open/Quit menu.
            </span>
          </div>
        </div>
      </HudPanel>
    </div>
  );
}
