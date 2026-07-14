// Typed wrappers around the Tauri command surface. Types come from the ts-rs bindings (SSOT,
// ADR-CORE-005). Run `npm run gen:types` after touching Rust DTOs.
import { invoke } from "@tauri-apps/api/core";
import type { BuildInfo } from "../bindings/BuildInfo";
import type { HotkeyStatus } from "../bindings/HotkeyStatus";
import type { LogRecord } from "../bindings/LogRecord";
import type { SettingsDto } from "../bindings/SettingsDto";
import type { ThemeChoice } from "../bindings/ThemeChoice";
import type { AudioDevice } from "../bindings/AudioDevice";
import type { ModelStatus } from "../bindings/ModelStatus";
import type { Job } from "../bindings/Job";
import type { VoiceRuleDto } from "../bindings/VoiceRuleDto";
import type { BuiltinCommandDto } from "../bindings/BuiltinCommandDto";

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
  updateSettings: (opts: {
    uiScale?: number;
    minimizeToTray?: boolean;
    theme?: ThemeChoice;
    language?: string;
  }) =>
    invoke<SettingsDto>("update_settings", {
      uiScale: opts.uiScale ?? null,
      minimizeToTray: opts.minimizeToTray ?? null,
      theme: opts.theme ?? null,
      language: opts.language ?? null,
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
  /**
   * Whether Huginn starts with the desktop — read from the OS, which is the only source of truth for
   * it (the user can remove the entry themselves).
   */
  getAutostart: () => invoke<boolean>("get_autostart"),
  /** Turn autostart on or off; resolves with the state the OS *actually* reports afterwards. */
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  /** Every microphone the system offers, read fresh — a headset plugged in just now must appear. */
  listMicrophones: () => invoke<AudioDevice[]>("list_microphones"),
  /** Choose the microphone.  means the system default. */
  setMicrophone: (name: string | null) => invoke<SettingsDto>("set_microphone", { name }),
  /** Turn the start/stop sounds on or off. */
  setSounds: (enabled: boolean) => invoke<SettingsDto>("set_sounds", { enabled }),
  /** Replace the full voice-command list — the editor owns the list and sends it whole (ADR-PROJ-010). */
  setRules: (rules: VoiceRuleDto[]) => invoke<SettingsDto>("set_rules", { rules }),
  /** Turn spoken punctuation ("Komma" → ",") on or off. Off by default: it steals the literal word. */
  setDictatePunctuation: (enabled: boolean) =>
    invoke<SettingsDto>("set_dictate_punctuation", { enabled }),
  /** The built-in voice commands for the current recognition language, for the in-app reference. */
  listBuiltinCommands: () => invoke<BuiltinCommandDto[]>("list_builtin_commands"),
  /** The model catalogue, annotated with what is actually installed. */
  listModels: () => invoke<ModelStatus[]>("list_models"),
  /**
   * Download a model and verify it against the checksum compiled into the binary.
   *
   * **The only outbound connection in the product** (ADR-PROJ-006), and it happens only because the
   * user clicked. Progress arrives as Jobs, not as a return value: it takes minutes.
   */
  downloadModel: (id: string) => invoke<void>("download_model", { id }),
  /** Choose the model that recognises speech, and load it into the worker. */
  setModel: (id: string) => invoke<SettingsDto>("set_model", { id }),
  /** Everything slow the backend is doing right now (ADR-PROJ-008). */
  listJobs: () => invoke<Job[]>("list_jobs"),
  /** Stop a job. The work actually stops; the row is not merely hidden. */
  cancelJob: (id: number) => invoke<void>("cancel_job", { id }),
  /** Open an http(s) URL in the default browser (routed through the backend so it is logged). */
  openExternal: (url: string) => invoke<void>("open_external", { url }),
};
