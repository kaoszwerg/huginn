// Global UI state (Zustand): active sidebar view + transient dialog flags.
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Top-level views (sidebar navigation). Product views are added here as they land. */
export type ViewId = "home" | "logs" | "settings";

const VIEWS: ViewId[] = ["home", "logs", "settings"];

export interface UiState {
  view: ViewId;
  /** Whether the HUD About dialog is open (transient — not persisted). */
  aboutOpen: boolean;

  setView: (v: ViewId) => void;
  setAboutOpen: (v: boolean) => void;
}

/** Global client-UI state (Zustand): the active sidebar view (persisted) + transient dialog flags. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      view: "home",
      aboutOpen: false,

      setView: (view) => set({ view }),
      setAboutOpen: (aboutOpen) => set({ aboutOpen }),
    }),
    {
      name: "app-ui",
      // Schema version for the Zustand-persist middleware (NOT the app version — that lives in
      // package.json and follows SemVer per ADR-CORE-024). Bump whenever the `partialize` shape changes
      // so any previously-stored payload is discarded and the defaults above apply.
      // 1: { view }
      version: 1,
      partialize: (s) => ({ view: s.view }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!VIEWS.includes(state.view)) state.view = "home";
      },
    },
  ),
);
