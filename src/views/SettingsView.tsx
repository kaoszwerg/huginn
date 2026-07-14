import { useState } from "react";
import { AudioLines, MessageSquareText, Mic, Palette, Power } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { HotkeyField } from "../components/ui/HotkeyField";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";
import { useHotkeyStatus, useSetHotkey } from "../hooks/useHotkey";
import { useAutostart, useSetAutostart } from "../hooks/useAutostart";
import { SpeechSection } from "./settings/SpeechSection";
import { CommandsSection } from "./settings/CommandsSection";
import { LANGUAGES } from "../i18n";
import type { ThemeChoice } from "../bindings/ThemeChoice";

/**
 * The settings sections. A rail rather than one long scroll: settings are *looked up*, not read top
 * to bottom, and a rail lets someone hunting for the hotkey find it without passing everything else.
 * A section is added here and rendered below — nothing else changes.
 */
const SECTIONS = [
  { id: "recording", labelKey: "settings.sections.recording", Icon: Mic },
  { id: "speech", labelKey: "settings.sections.speech", Icon: AudioLines },
  { id: "commands", labelKey: "settings.sections.commands", Icon: MessageSquareText },
  { id: "appearance", labelKey: "settings.sections.appearance", Icon: Palette },
  { id: "background", labelKey: "settings.sections.background", Icon: Power },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const UI_SCALES = [0.8, 0.9, 1.0, 1.1, 1.25, 1.5] as const;

const THEMES: { id: ThemeChoice; labelKey: string }[] = [
  { id: "system", labelKey: "settings.appearance.themeSystem" },
  { id: "light", labelKey: "settings.appearance.themeLight" },
  { id: "dark", labelKey: "settings.appearance.themeDark" },
];

export function SettingsView() {
  const { t } = useTranslation();
  const [section, setSection] = useState<SectionId>("recording");

  return (
    <div className="flex h-full">
      <nav
        aria-label={t("settings.sectionsAria")}
        className="bg-surface border-line flex w-44 shrink-0 flex-col gap-1 border-r p-2"
      >
        {SECTIONS.map(({ id, labelKey, Icon }) => (
          <Button
            key={id}
            variant="ghost"
            active={section === id}
            aria-current={section === id ? "page" : undefined}
            onClick={() => setSection(id)}
            data-testid={`section-${id}`}
            className="justify-start gap-2 px-3 py-2"
          >
            <Icon size={15} strokeWidth={section === id ? 2.25 : 1.75} />
            {t(labelKey)}
          </Button>
        ))}
      </nav>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {section === "recording" ? <RecordingSection /> : null}
        {section === "speech" ? <SpeechSection /> : null}
        {section === "commands" ? <CommandsSection /> : null}
        {section === "appearance" ? <AppearanceSection /> : null}
        {section === "background" ? <BackgroundSection /> : null}
      </div>
    </div>
  );
}

function RecordingSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const hotkey = useHotkeyStatus();
  const setHotkey = useSetHotkey();
  const shortcut = hotkey.data?.shortcut ?? settings.data?.hotkey ?? "Ctrl+Space";

  return (
    <Panel label={t("settings.recording.title")} info={<p>{t("settings.recording.info")}</p>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-fg text-sm">{t("settings.recording.combination")}</span>
            <span className="text-dim text-xs">{t("settings.recording.combinationHint")}</span>
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
            <strong className="text-fg">{t("hotkey.dead")}</strong>{" "}
            {hotkey.data.error ?? t("hotkey.deadFallback")} {t("hotkey.chooseAnother")}
          </Notice>
        ) : null}

        {hotkey.data?.registered && setHotkey.isSuccess ? (
          <Notice tone="success">{t("hotkey.armed")}</Notice>
        ) : null}
      </div>
    </Panel>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const scale = settings.data?.ui_scale ?? 1;
  const theme = settings.data?.theme ?? "system";
  const language = settings.data?.language ?? "de";

  return (
    <Panel label={t("settings.appearance.title")}>
      <div className="flex flex-col gap-4">
        <Field
          label={t("settings.appearance.language")}
          hint={t("settings.appearance.languageHint")}
        >
          <div className="flex flex-wrap gap-1">
            {LANGUAGES.map((l) => (
              <Button
                key={l.code}
                variant="ghost"
                aria-pressed={language === l.code}
                active={language === l.code}
                onClick={() => update.mutate({ language: l.code })}
                data-testid={`lang-${l.code}`}
              >
                {l.label}
              </Button>
            ))}
          </div>
        </Field>

        <Field label={t("settings.appearance.theme")} hint={t("settings.appearance.themeHint")}>
          <div className="flex flex-wrap gap-1">
            {THEMES.map((th) => (
              <Button
                key={th.id}
                variant="ghost"
                aria-pressed={theme === th.id}
                active={theme === th.id}
                onClick={() => update.mutate({ theme: th.id })}
                data-testid={`theme-${th.id}`}
              >
                {t(th.labelKey)}
              </Button>
            ))}
          </div>
        </Field>

        <Field label={t("settings.appearance.size")}>
          <div className="flex flex-wrap gap-1">
            {UI_SCALES.map((s) => (
              <Button
                key={s}
                variant="ghost"
                aria-pressed={Math.abs(scale - s) < 0.001}
                active={Math.abs(scale - s) < 0.001}
                onClick={() => update.mutate({ uiScale: s })}
                data-testid={`size-${Math.round(s * 100)}`}
                className="font-mono"
              >
                {Math.round(s * 100)}%
              </Button>
            ))}
          </div>
        </Field>
      </div>
    </Panel>
  );
}

function BackgroundSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const autostart = useAutostart();
  const setAutostart = useSetAutostart();
  const minimizeToTray = settings.data?.minimize_to_tray ?? true;

  return (
    <Panel label={t("settings.background.title")} info={<p>{t("settings.background.info")}</p>}>
      <div className="flex flex-col gap-4">
        <Field
          label={t("settings.background.autostart")}
          hint={t("settings.background.autostartHint")}
        >
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              aria-pressed={autostart.data === true}
              active={autostart.data === true}
              disabled={setAutostart.isPending}
              onClick={() => setAutostart.mutate(true)}
              data-testid="autostart-on"
            >
              {t("settings.background.on")}
            </Button>
            <Button
              variant="ghost"
              aria-pressed={autostart.data === false}
              active={autostart.data === false}
              disabled={setAutostart.isPending}
              onClick={() => setAutostart.mutate(false)}
              data-testid="autostart-off"
            >
              {t("settings.background.off")}
            </Button>
          </div>
          {setAutostart.isError ? (
            <Notice tone="danger" className="mt-2">
              {t("settings.background.autostartFailed")}{" "}
              {setAutostart.error instanceof Error ? setAutostart.error.message : ""}
            </Notice>
          ) : null}
        </Field>

        <Field label={t("settings.background.onClose")} hint={t("settings.background.onCloseHint")}>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              aria-pressed={minimizeToTray}
              active={minimizeToTray}
              onClick={() => update.mutate({ minimizeToTray: true })}
              data-testid="tray-keep"
            >
              {t("settings.background.keepRunning")}
            </Button>
            <Button
              variant="ghost"
              aria-pressed={!minimizeToTray}
              active={!minimizeToTray}
              onClick={() => update.mutate({ minimizeToTray: false })}
              data-testid="tray-close"
            >
              {t("settings.background.quit")}
            </Button>
          </div>
        </Field>
      </div>
    </Panel>
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
