import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { TitleBar } from "./components/layout/TitleBar";
import { StatusBar } from "./components/layout/StatusBar";
import { JobMonitor } from "./components/layout/JobMonitor";
import { Sidebar } from "./components/sidebar/Sidebar";
import { AboutDialog } from "./components/AboutDialog";
import { Notice } from "./components/ui/Notice";
import { Button } from "./components/ui/Button";
import { HomeView } from "./views/HomeView";
import { LogsView } from "./views/LogsView";
import { SettingsView } from "./views/SettingsView";
import { useScrollTop } from "./hooks/useScrollTop";
import { useApplyUiScale } from "./hooks/useUiScale";
import { useApplyTheme } from "./hooks/useTheme";
import { useApplyLanguage } from "./hooks/useLanguage";
import { useHotkeyStatus } from "./hooks/useHotkey";
import { useNativeContextMenuGuard } from "./hooks/useNativeContextMenuGuard";
import { useUiStore } from "./store/ui";

/**
 * The application shell (ADR-PROJ-003): a frameless window with a quiet hairline border and soft
 * corners — no chamfer, no glow, no animated frame. The window is transparent, so the rounded
 * corners reveal the desktop behind them; everything the user sees is drawn inside this container.
 *
 * A product view is registered here and in the sidebar's nav list — nothing else in the shell
 * changes when one is added.
 */
export default function App() {
  const { t } = useTranslation();
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const aboutOpen = useUiStore((s) => s.aboutOpen);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const mainRef = useRef<HTMLElement>(null);
  const { canTop, scrollToTop } = useScrollTop(mainRef, view);
  const hotkey = useHotkeyStatus();
  useApplyTheme();
  useApplyLanguage();
  useApplyUiScale();
  useNativeContextMenuGuard();

  // Push-to-talk is the whole product. If it did not arm — because another application already owns
  // the combination — the app looks alive and does nothing, and the user has no way to know. So it
  // is said here, in the window, on sight (rule:overlay-and-input). A line in a log file is not a
  // message to a user: nobody reads it.
  const hotkeyDead = hotkey.data && !hotkey.data.registered;

  return (
    <div className="bg-bg border-line flex h-full flex-col overflow-hidden rounded-[10px] border">
      <TitleBar />

      {hotkeyDead ? (
        <Notice
          tone="danger"
          className="mx-3 mt-3 rounded-[var(--radius-panel)]"
          action={
            view === "settings" ? undefined : (
              <Button tone="danger" onClick={() => setView("settings")}>
                {t("hotkey.fix")}
              </Button>
            )
          }
        >
          <strong className="text-fg">{t("hotkey.dead")}</strong>{" "}
          {hotkey.data?.error ?? t("hotkey.deadFallback")}
        </Notice>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main ref={mainRef} className="flex-1 overflow-hidden">
          {view === "home" ? <HomeView /> : null}
          {view === "logs" ? <LogsView /> : null}
          {view === "settings" ? <SettingsView /> : null}
        </main>
      </div>
      {/* Nothing slow happens invisibly (ADR-PROJ-008). */}
      <JobMonitor />
      <StatusBar canScrollTop={canTop} onScrollTop={scrollToTop} />
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </div>
  );
}
