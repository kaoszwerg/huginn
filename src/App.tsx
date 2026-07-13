import { useRef } from "react";
import { TitleBar } from "./components/layout/TitleBar";
import { StatusBar } from "./components/layout/StatusBar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { AboutDialog } from "./components/AboutDialog";
import { HomeView } from "./views/HomeView";
import { LogsView } from "./views/LogsView";
import { SettingsView } from "./views/SettingsView";
import { useScrollTop } from "./hooks/useScrollTop";
import { useApplyUiScale } from "./hooks/useUiScale";
import { useNativeContextMenuGuard } from "./hooks/useNativeContextMenuGuard";
import { useUiStore } from "./store/ui";

/** Application shell: frameless HUD chrome with a sidebar and the routed views. Product views are
 * registered here and in the Sidebar's nav list — nothing else in the shell needs to change. */
export default function App() {
  const view = useUiStore((s) => s.view);
  const aboutOpen = useUiStore((s) => s.aboutOpen);
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);
  const mainRef = useRef<HTMLElement>(null);
  const { canTop, scrollToTop } = useScrollTop(mainRef, view);
  useApplyUiScale();
  useNativeContextMenuGuard();

  return (
    <div className="window-frame h-full">
      <div className="window-frame-inner hud-grid-bg flex h-full flex-col">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main ref={mainRef} className="flex-1 overflow-hidden">
            {view === "home" ? <HomeView /> : null}
            {view === "logs" ? <LogsView /> : null}
            {view === "settings" ? <SettingsView /> : null}
          </main>
        </div>
        <StatusBar canScrollTop={canTop} onScrollTop={scrollToTop} />
      </div>
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </div>
  );
}
