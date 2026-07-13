//! Boundary types (Rust -> TypeScript). `ts-rs` exports these into `src/bindings/` so the frontend
//! never re-declares a shape by hand (ADR-CORE-005). Run `npm run gen:types` after any change here.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Build identity: SemVer version, channel (dev/release), and the exact commit it was built from
/// (ADR-CORE-024). Rendered in the title bar, status bar and About dialog.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct BuildInfo {
    /// SemVer version, from `package.json` via `CARGO_PKG_VERSION`.
    pub version: String,
    /// Build channel: `"dev"` for debug builds, `"release"` otherwise (ADR-CORE-024).
    pub channel: String,
    /// Whether this is a debug build (`cfg!(debug_assertions)`).
    pub debug: bool,
    /// Short git commit SHA the binary was built from (set by `build.rs`).
    pub git_sha: String,
    /// Whether the working tree was dirty at build time.
    pub git_dirty: bool,
    /// Commit date of `git_sha` (ISO-8601) — answers "what's in this build".
    pub commit_date: String,
}

/// Which appearance the user wants (ADR-PROJ-003). `System` follows the OS setting and is the
/// default: an app that ignores the desktop's own light/dark choice is the one that stands out.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "lowercase")]
pub enum ThemeChoice {
    #[default]
    System,
    Light,
    Dark,
}

/// Persisted user preferences. Stored as JSON under `<app_data_dir>/settings.json`.
///
/// Every field carries a serde default so a settings file written by an older version — missing a
/// newer field — still loads (the missing field falls back to its default) rather than failing to
/// parse and silently discarding the user's other preferences.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct SettingsDto {
    /// WebView zoom factor applied to the whole UI (ADR-APP-021). Clamped to [0.7, 1.6].
    #[serde(default = "default_ui_scale")]
    pub ui_scale: f64,
    /// When true, closing the window keeps Huginn running in the system tray instead of quitting.
    ///
    /// **Default `true`, unlike the shell it was scaffolded from.** Huginn *is* a background tool: the
    /// push-to-talk hotkey is the product, and it only works while the process lives. Quitting on a
    /// window close would mean the user closes a window they no longer need and silently loses
    /// dictation everywhere — the product would look like it worked and then stop, which is worse than
    /// an app that never started.
    #[serde(default = "default_minimize_to_tray")]
    pub minimize_to_tray: bool,
    /// Light, dark, or follow the OS (default).
    #[serde(default)]
    pub theme: ThemeChoice,
    /// The **interface** language (`"de"`, `"en"`). Not the language Huginn recognises — that one
    /// comes with the model (ADR-PROJ-006).
    ///
    /// German is Huginn's first language, not a translation of an English original: the product is a
    /// German dictation tool, and an untranslated key falls back to German rather than to a raw
    /// identifier.
    ///
    /// A plain string, not an enum: adding a language must mean a new locale file plus one line in
    /// the frontend — never a change to the IPC contract and a rebuilt backend.
    #[serde(default = "default_language")]
    pub language: String,
    /// The push-to-talk combination, in the shortcut syntax (`"Ctrl+Space"`, `"Ctrl+Shift+KeyJ"`).
    ///
    /// It is a *preference*, not a fact: the combination stored here may fail to register — another
    /// application can already own it. Whether it is actually armed is [`HotkeyStatus`], and that is
    /// what the UI must show the user (rule:overlay-and-input).
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
}

fn default_ui_scale() -> f64 {
    1.0
}

/// A dictation tool that stops listening when its window is closed is broken (see the field's docs).
fn default_minimize_to_tray() -> bool {
    true
}

/// German. Huginn is a German dictation tool first; English is the second language.
fn default_language() -> String {
    "de".to_string()
}

/// Two keys, chosen by the maintainer. Not three: a combination you hold while speaking has to be
/// comfortable, and a chord of three is not.
fn default_hotkey() -> String {
    "Ctrl+Space".to_string()
}

/// Whether push-to-talk is actually armed — the difference between what the user asked for and what
/// the operating system granted.
///
/// This exists because a dictation app whose only key silently does nothing is indistinguishable
/// from a broken one. The failure is **shown** (ADR-PROJ-004): nobody reads a log file.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct HotkeyStatus {
    /// The combination that was attempted, as the user sees it.
    pub shortcut: String,
    /// True when the OS accepted the registration and holding the key will record.
    pub registered: bool,
    /// Why it is not armed, in words a user can act on. `None` when `registered` is true.
    pub error: Option<String>,
}

impl Default for SettingsDto {
    fn default() -> Self {
        Self {
            ui_scale: default_ui_scale(),
            minimize_to_tray: default_minimize_to_tray(),
            theme: ThemeChoice::default(),
            language: default_language(),
            hotkey: default_hotkey(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_defaults_are_the_quiet_ones() {
        let d = SettingsDto::default();
        assert_eq!(d.ui_scale, 1.0);
        // Follow the desktop rather than override it, and start with two keys, not three.
        assert_eq!(d.theme, ThemeChoice::System);
        assert_eq!(
            d.language, "de",
            "German is the first language, not a translation"
        );
        assert_eq!(d.hotkey, "Ctrl+Space");
    }

    #[test]
    fn huginn_keeps_running_when_its_window_is_closed() {
        // The one default that is not cosmetic: push-to-talk only works while the process lives, so
        // quitting on a window close would silently take dictation away system-wide. If a future
        // change flips this back, this test is the thing that says why it must not.
        assert!(
            SettingsDto::default().minimize_to_tray,
            "closing the window must not stop the hotkey"
        );
    }

    #[test]
    fn settings_roundtrip_through_json() {
        let s = SettingsDto {
            ui_scale: 1.25,
            minimize_to_tray: true,
            theme: ThemeChoice::Dark,
            language: "en".to_string(),
            hotkey: "Ctrl+Shift+KeyJ".to_string(),
        };
        let json = serde_json::to_string(&s).expect("serialize");
        let back: SettingsDto = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.ui_scale, 1.25);
        assert!(back.minimize_to_tray);
        assert_eq!(back.theme, ThemeChoice::Dark);
        assert_eq!(back.hotkey, "Ctrl+Shift+KeyJ");
    }

    #[test]
    fn settings_from_older_file_defaults_missing_fields() {
        // A file written before `theme`/`hotkey` existed must still load without data loss.
        let s: SettingsDto = serde_json::from_str(r#"{"ui_scale":1.25}"#).expect("deserialize");
        assert_eq!(s.ui_scale, 1.25);
        assert!(
            s.minimize_to_tray,
            "a file that predates the field gets the safe default: keep running"
        );
        assert_eq!(s.theme, ThemeChoice::System);
        assert_eq!(s.hotkey, "Ctrl+Space");
    }

    #[test]
    fn theme_serialises_as_the_lowercase_word_the_frontend_matches_on() {
        // The frontend keys off these exact strings; a rename here would silently break it, so the
        // contract is pinned on the side that produces it (rule:testing).
        assert_eq!(
            serde_json::to_string(&ThemeChoice::System).expect("serialize"),
            r#""system""#
        );
        assert_eq!(
            serde_json::to_string(&ThemeChoice::Light).expect("serialize"),
            r#""light""#
        );
        assert_eq!(
            serde_json::to_string(&ThemeChoice::Dark).expect("serialize"),
            r#""dark""#
        );
    }

    #[test]
    fn settings_contract_field_names_are_stable() {
        // Pin the JSON keys the generated frontend binding depends on (rule:testing contract).
        let json = serde_json::to_value(SettingsDto::default()).expect("to_value");
        for key in [
            "ui_scale",
            "minimize_to_tray",
            "theme",
            "language",
            "hotkey",
        ] {
            assert!(json.get(key).is_some(), "{key} key missing");
        }
    }

    #[test]
    fn hotkey_status_carries_a_reason_when_it_is_not_armed() {
        // The UI shows `error` verbatim; a status that is not registered and has no reason would
        // leave the user with a dead key and no explanation.
        let status = HotkeyStatus {
            shortcut: "Ctrl+Space".to_string(),
            registered: false,
            error: Some("already used by another application".to_string()),
        };
        let json = serde_json::to_value(&status).expect("to_value");
        assert_eq!(
            json.get("registered").and_then(|v| v.as_bool()),
            Some(false)
        );
        assert!(json.get("error").and_then(|v| v.as_str()).is_some());
    }
}
