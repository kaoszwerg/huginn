import { useEffect } from "react";
import { useSettings } from "./useSettings";

/**
 * Apply the user's theme choice (ADR-PROJ-003).
 *
 * The CSS carries both themes; this only decides *which* rule wins:
 *
 * - `system` (the default) removes the attribute, so `prefers-color-scheme` decides — an app that
 *   ignores the desktop's own light/dark setting is the one that stands out.
 * - `light` / `dark` stamp `data-theme` on `<html>`, which overrides the media query in **both**
 *   directions (a user who wants dark on a light desktop must get it).
 *
 * No colour is computed here. The tokens live in `globals.css`, and they are the only thing that
 * knows what "dark" looks like (rule:design-system).
 */
export function useApplyTheme() {
  const { data } = useSettings();
  const theme = data?.theme ?? "system";

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);
}
