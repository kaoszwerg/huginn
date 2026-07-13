import { useEffect } from "react";

/**
 * Suppresses the native browser/WebView right-click menu app-wide (ADR-APP-026). The default menu
 * (Reload / Inspect / Copy image / Back …) is unstyled OS chrome and a break in the HUD, and any
 * context menu the app needs is built as a HUD component instead.
 *
 * It is suppressed in **every** build. DevTools/Inspect are not lost in development: WebView2 (Windows)
 * and WebKitGTK (Linux) expose DevTools through their own built-in shortcuts (F12 / Ctrl+Shift+I),
 * which are independent of the page's context menu. The listener is attached to `document` and cleaned
 * up on unmount.
 */
export function useNativeContextMenuGuard(): void {
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);
}
