import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useSettings } from "./useSettings";

/**
 * Apply the user's UI scale (Settings) via the *native* WebView zoom (ADR-APP-021). CSS `zoom` is a
 * fallback for environments where the Tauri webview API is unavailable (e.g. vitest/jsdom).
 */
export function useApplyUiScale() {
  const { data } = useSettings();
  const scale = data?.ui_scale ?? 1;
  useEffect(() => {
    const cssFallback = () => document.documentElement.style.setProperty("zoom", String(scale));
    try {
      void getCurrentWebview()
        .setZoom(scale)
        .then(() => {
          // Clear any leftover CSS zoom — the native webview path is authoritative.
          document.documentElement.style.removeProperty("zoom");
        })
        .catch(cssFallback);
    } catch {
      cssFallback();
    }
  }, [scale]);
}
