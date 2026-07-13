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
    /// When true, closing the window hides the app to a system-tray icon instead of quitting, so it
    /// keeps running in the background (ADR-APP-021). Default `false` — a fresh app is a normal window.
    #[serde(default)]
    pub minimize_to_tray: bool,
}

fn default_ui_scale() -> f64 {
    1.0
}

impl Default for SettingsDto {
    fn default() -> Self {
        Self {
            ui_scale: default_ui_scale(),
            minimize_to_tray: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_default_is_scale_one_no_tray() {
        let d = SettingsDto::default();
        assert_eq!(d.ui_scale, 1.0);
        assert!(!d.minimize_to_tray);
    }

    #[test]
    fn settings_roundtrip_through_json() {
        let s = SettingsDto {
            ui_scale: 1.25,
            minimize_to_tray: true,
        };
        let json = serde_json::to_string(&s).expect("serialize");
        let back: SettingsDto = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.ui_scale, 1.25);
        assert!(back.minimize_to_tray);
    }

    #[test]
    fn settings_from_older_file_defaults_missing_fields() {
        // A file written before `minimize_to_tray` existed must still load without data loss.
        let s: SettingsDto = serde_json::from_str(r#"{"ui_scale":1.25}"#).expect("deserialize");
        assert_eq!(s.ui_scale, 1.25);
        assert!(!s.minimize_to_tray);
    }

    #[test]
    fn settings_contract_field_names_are_stable() {
        // Pin the JSON keys the generated frontend binding depends on (rule:testing contract).
        let json = serde_json::to_value(SettingsDto::default()).expect("to_value");
        assert!(json.get("ui_scale").is_some(), "ui_scale key missing");
        assert!(
            json.get("minimize_to_tray").is_some(),
            "minimize_to_tray key missing"
        );
    }
}
