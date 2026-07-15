//! Boundary types (Rust -> TypeScript). `ts-rs` exports these into `src/bindings/` so the frontend
//! never re-declares a shape by hand (ADR-CORE-005). Run `npm run gen:types` after any change here.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// A fatal error from the UI runtime, handed over IPC to be recorded (ADR-CORE-037, ADR-APP-032).
///
/// The webview is its own entry point: a Rust panic hook cannot see anything thrown inside it, so the
/// frontend hands its last-resort failures across the boundary instead. Nothing here leaves the device
/// (rule:privacy) — it is written to `<app_data_dir>/crashes/` and to the log, and that is all.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CrashReport {
    /// Where in the UI runtime it surfaced: `render`, `uncaught` or `unhandledrejection`.
    pub source: String,
    /// The error's message. Never a secret or user content (rule:logging).
    pub message: String,
    /// JS stack trace, when the thrown value carried one (a thrown string does not).
    pub stack: Option<String>,
}

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

/// What a voice rule does (ADR-PROJ-010). Adjacently tagged so the frontend sees a clean union:
/// `{ kind: "line" } | { kind: "paragraph" } | { kind: "insert", template: string }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "kind", content = "template", rename_all = "lowercase")]
pub enum VoiceActionDto {
    /// A single line break.
    Line,
    /// A blank line (two breaks).
    Paragraph,
    /// Insert a template — literal text with `{date}`/`{time}`/`{clipboard}`/`{cursor}` placeholders.
    /// This one variant is both spoken punctuation and macros.
    Insert(String),
}

/// A user-defined (or built-in) voice command (ADR-PROJ-010). Stored on-device in the settings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct VoiceRuleDto {
    /// Stable id, generated when the rule is created; how the editor addresses it.
    pub id: String,
    /// Trigger phrases, as spoken. Matched case-insensitively, punctuation-tolerant.
    pub phrases: Vec<String>,
    pub action: VoiceActionDto,
    /// Recognition languages this fires on: `["de"]`, `["en"]`, or `["*"]` for every language.
    pub languages: Vec<String>,
    pub enabled: bool,
}

impl VoiceRuleDto {
    /// Convert to the pure engine's rule type (the engine knows nothing about serde or the id).
    pub fn to_rule(&self) -> huginn_text::Rule {
        huginn_text::Rule {
            phrases: self.phrases.clone(),
            action: match &self.action {
                VoiceActionDto::Line => huginn_text::Action::LineBreak,
                VoiceActionDto::Paragraph => huginn_text::Action::Paragraph,
                VoiceActionDto::Insert(t) => huginn_text::Action::Insert(t.clone()),
            },
            languages: self.languages.clone(),
            enabled: self.enabled,
        }
    }
}

/// A built-in command, for the in-app reference (SSOT with the engine, ADR-PROJ-010).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct BuiltinCommandDto {
    /// The phrases that trigger it, as spoken.
    pub phrases: Vec<String>,
    /// `"line"`, `"paragraph"`, or `"punctuation"`.
    pub kind: String,
    /// The character a punctuation command inserts; empty otherwise.
    pub inserts: String,
    /// True for the opt-in punctuation set.
    pub punctuation: bool,
}

impl From<huginn_text::BuiltinInfo> for BuiltinCommandDto {
    fn from(b: huginn_text::BuiltinInfo) -> Self {
        Self {
            phrases: b.phrases,
            kind: b.kind,
            inserts: b.inserts,
            punctuation: b.punctuation,
        }
    }
}

/// One entry in a directory listing, for the in-app file picker (ADR-APP-026: the OS file dialog is a
/// native control we do not use — the picker is built from our own primitives instead).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct DirEntryDto {
    /// The entry's display name (the last path component).
    pub name: String,
    /// The full path, for navigating into it or selecting it.
    pub path: String,
    /// True for a directory, false for a file.
    pub is_dir: bool,
}

/// A directory's contents plus where it sits, so the picker can render a list and a way back up.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct DirListingDto {
    /// The directory being listed.
    pub path: String,
    /// Its parent, or `None` at a filesystem root.
    pub parent: Option<String>,
    /// Directories first, then files, each alphabetical.
    pub entries: Vec<DirEntryDto>,
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
    /// The microphone the user picked, by name.  means the system default — and a name that is
    /// no longer there falls back to the default too, rather than losing the sentence someone is in
    /// the middle of speaking (huginn-audio).
    #[serde(default)]
    pub microphone: Option<String>,
    /// Which model recognises the speech. An id from the compiled-in catalogue (huginn-models).
    #[serde(default = "default_model")]
    pub model: String,
    /// The language Huginn **recognises** — not the language of the interface. German by default;
    /// the multilingual models handle German and English both (ADR-PROJ-006).
    #[serde(default = "default_recognition_language")]
    pub recognition_language: String,
    /// Play a short sound when recording starts and stops.
    ///
    /// On by default: with push-to-talk there is no other confirmation that the microphone is
    /// actually live, and an overlay the user is not looking at is not one.
    #[serde(default = "default_sounds")]
    pub sounds: bool,
    /// The push-to-talk combination, in the shortcut syntax (, ).
    ///
    /// It is a *preference*, not a fact: the combination stored here may fail to register — another
    /// application can already own it. Whether it is actually armed is [`HotkeyStatus`], and that is
    /// what the UI must show the user (rule:overlay-and-input).
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
    /// The user's voice commands and macros (ADR-PROJ-010). Empty by default — the built-in structure
    /// commands need no entry here; this list is what the user adds on top.
    #[serde(default)]
    pub rules: Vec<VoiceRuleDto>,
    /// When true, spoken punctuation ("Komma" → ",") is active. Off by default: it steals the literal
    /// word, so the user opts in.
    #[serde(default)]
    pub dictate_punctuation: bool,
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

/// The multilingual model that speaks German (huginn-models::DEFAULT_MODEL).
fn default_model() -> String {
    "ggml-base".to_string()
}

fn default_recognition_language() -> String {
    "de".to_string()
}

fn default_sounds() -> bool {
    true
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
            microphone: None,
            model: default_model(),
            recognition_language: default_recognition_language(),
            sounds: default_sounds(),
            hotkey: default_hotkey(),
            rules: Vec::new(),
            dictate_punctuation: false,
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
            microphone: Some("Yeti X".to_string()),
            model: "ggml-small".to_string(),
            recognition_language: "de".to_string(),
            sounds: false,
            hotkey: "Ctrl+Shift+KeyJ".to_string(),
            rules: vec![VoiceRuleDto {
                id: "r1".to_string(),
                phrases: vec!["grußformel".to_string()],
                action: VoiceActionDto::Insert("Mit freundlichen Grüßen".to_string()),
                languages: vec!["de".to_string()],
                enabled: true,
            }],
            dictate_punctuation: true,
        };
        let json = serde_json::to_string(&s).expect("serialize");
        let back: SettingsDto = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(back.ui_scale, 1.25);
        assert!(back.minimize_to_tray);
        assert_eq!(back.theme, ThemeChoice::Dark);
        assert_eq!(back.hotkey, "Ctrl+Shift+KeyJ");
        assert!(back.dictate_punctuation);
        assert_eq!(back.rules.len(), 1);
        assert_eq!(
            back.rules[0].action,
            VoiceActionDto::Insert("Mit freundlichen Grüßen".to_string())
        );
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
