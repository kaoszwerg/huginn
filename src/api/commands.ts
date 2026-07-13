// Typed wrappers around the Tauri command surface. Types come from the ts-rs bindings (SSOT,
// ADR-CORE-005). Run `npm run gen:types` after touching Rust DTOs.
import { invoke } from "@tauri-apps/api/core";
import type { BuildInfo } from "../bindings/BuildInfo";
import type { LogRecord } from "../bindings/LogRecord";
import type { SettingsDto } from "../bindings/SettingsDto";

/**
 * Typed facade over the backend `#[tauri::command]` surface. Every IPC call in the app flows through
 * here (rule:frontend-architecture), so payload shapes live in one place and match the generated
 * bindings.
 */
export const api = {
  /** App SemVer version (IPC smoke test). */
  appVersion: () => invoke<string>("app_version"),
  /** Build identity: version, channel and the commit the binary was built from. */
  buildInfo: () => invoke<BuildInfo>("build_info"),
  /** Snapshot of the recent log ring buffer for the Logs view's initial load. */
  getRecentLogs: () => invoke<LogRecord[]>("get_recent_logs"),
  /** Read the persisted user settings. */
  getSettings: () => invoke<SettingsDto>("get_settings"),
  /**
   * Partial update — omitted fields keep their current value. Toggling `minimizeToTray` installs or
   * removes the system-tray icon immediately (no restart).
   */
  updateSettings: (opts: { uiScale?: number; minimizeToTray?: boolean }) =>
    invoke<SettingsDto>("update_settings", {
      uiScale: opts.uiScale ?? null,
      minimizeToTray: opts.minimizeToTray ?? null,
    }),
  /** Open an http(s) URL in the default browser (routed through the backend so it is logged). */
  openExternal: (url: string) => invoke<void>("open_external", { url }),
};
