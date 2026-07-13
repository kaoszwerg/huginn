// Typed wrappers around the Tauri command surface. Types come from the ts-rs bindings (SSOT,
// ADR-CORE-005). Run `npm run gen:types` after touching Rust DTOs.
import { invoke } from "@tauri-apps/api/core";
import type { BuildInfo } from "../bindings/BuildInfo";
import type { HotkeyStatus } from "../bindings/HotkeyStatus";
import type { LogRecord } from "../bindings/LogRecord";
import type { SettingsDto } from "../bindings/SettingsDto";
import type { ThemeChoice } from "../bindings/ThemeChoice";

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
   *
   * The hotkey is not here on purpose: changing it can be refused by the OS, so it has its own
   * command that reports what actually happened (`setHotkey`).
   */
  updateSettings: (opts: { uiScale?: number; minimizeToTray?: boolean; theme?: ThemeChoice }) =>
    invoke<SettingsDto>("update_settings", {
      uiScale: opts.uiScale ?? null,
      minimizeToTray: opts.minimizeToTray ?? null,
      theme: opts.theme ?? null,
    }),
  /** Whether push-to-talk is actually armed — and if not, why not. */
  getHotkeyStatus: () => invoke<HotkeyStatus>("get_hotkey_status"),
  /**
   * Try to make `shortcut` the push-to-talk key.
   *
   * Resolves with the resulting status **even when the OS refused it** — a taken combination is a
   * state to display, not an exception to catch. It rejects only on a genuine fault (a malformed
   * request).
   */
  setHotkey: (shortcut: string) => invoke<HotkeyStatus>("set_hotkey", { shortcut }),
  /** Open an http(s) URL in the default browser (routed through the backend so it is logged). */
  openExternal: (url: string) => invoke<void>("open_external", { url }),
};
