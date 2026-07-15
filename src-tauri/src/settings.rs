//! Persisted user settings — a small JSON document under `<app_data_dir>/settings.json`.
//!
//! There is no database on purpose: settings are a handful of scalar preferences, so a single JSON
//! file (written atomically via a temp file + rename) is the honest fit. Reads are served from an
//! in-memory copy behind an `RwLock`; every write persists immediately, so a crash can never lose
//! more than the write in flight.

use crate::dto::{SettingsDto, ThemeChoice};
use crate::error::{AppError, Result};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub const MIN_UI_SCALE: f64 = 0.7;
pub const MAX_UI_SCALE: f64 = 1.6;

/// A partial update: every field is optional, and `None` means "leave it alone".
///
/// A struct rather than a growing list of positional `Option`s — the fourth `Option<bool>` in a
/// signature is the one a caller passes in the wrong slot, and the compiler cannot see it.
#[derive(Debug, Default, Clone)]
pub struct SettingsPatch {
    pub ui_scale: Option<f64>,
    pub minimize_to_tray: Option<bool>,
    pub theme: Option<ThemeChoice>,
    pub language: Option<String>,
    pub microphone: Option<Option<String>>,
    pub model: Option<String>,
    pub recognition_language: Option<String>,
    pub sounds: Option<bool>,
    /// The push-to-talk combination. Persisted only *after* the OS accepted it (see
    /// `pushtotalk::set_hotkey`): storing a shortcut that cannot be registered would leave the user with
    /// a setting that lies.
    pub hotkey: Option<String>,
    /// The full voice-command list, replacing whatever was there (the editor owns the list and sends
    /// it whole — ADR-PROJ-010).
    pub rules: Option<Vec<crate::dto::VoiceRuleDto>>,
    /// Whether spoken punctuation is active.
    pub dictate_punctuation: Option<bool>,
}

/// Thread-safe settings store: in-memory state + the JSON file it is persisted to.
pub struct SettingsStore {
    path: PathBuf,
    current: RwLock<SettingsDto>,
}

impl SettingsStore {
    /// Load `<data_dir>/settings.json`. A missing or unreadable file yields the defaults — a corrupt
    /// settings file must never stop the app from starting; it is logged and replaced on the next
    /// write.
    pub fn load(data_dir: &Path) -> Self {
        let path = data_dir.join("settings.json");
        let current = match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<SettingsDto>(&raw) {
                Ok(s) => {
                    tracing::info!(
                        path = %path.display(),
                        ui_scale = s.ui_scale,
                        minimize_to_tray = s.minimize_to_tray,
                        theme = ?s.theme,
                        hotkey = %s.hotkey,
                        "settings loaded"
                    );
                    sanitize(s)
                }
                Err(e) => {
                    tracing::warn!(path = %path.display(), error = %e, "settings file unreadable — using defaults");
                    SettingsDto::default()
                }
            },
            Err(_) => {
                tracing::info!(path = %path.display(), "no settings file yet — using defaults");
                SettingsDto::default()
            }
        };
        Self {
            path,
            current: RwLock::new(current),
        }
    }

    /// Current settings snapshot.
    pub fn get(&self) -> SettingsDto {
        match self.current.read() {
            Ok(guard) => guard.clone(),
            Err(_) => SettingsDto::default(),
        }
    }

    /// Apply a partial update, persist it, and return the new state.
    pub fn update(&self, patch: SettingsPatch) -> Result<SettingsDto> {
        let next = {
            let mut guard = self
                .current
                .write()
                .map_err(|_| AppError::Other("settings lock poisoned".into()))?;
            if let Some(scale) = patch.ui_scale {
                guard.ui_scale = scale.clamp(MIN_UI_SCALE, MAX_UI_SCALE);
            }
            if let Some(tray) = patch.minimize_to_tray {
                guard.minimize_to_tray = tray;
            }
            if let Some(theme) = patch.theme {
                guard.theme = theme;
            }
            if let Some(language) = patch.language {
                guard.language = language;
            }
            // Option<Option<T>>: the outer None means "leave it alone", the inner None means "use the
            // system default microphone". Collapsing them would make it impossible to go back to the
            // default once a device had been chosen.
            if let Some(microphone) = patch.microphone {
                guard.microphone = microphone;
            }
            if let Some(model) = patch.model {
                guard.model = model;
            }
            if let Some(language) = patch.recognition_language {
                guard.recognition_language = language;
            }
            if let Some(sounds) = patch.sounds {
                guard.sounds = sounds;
            }
            if let Some(hotkey) = patch.hotkey {
                guard.hotkey = hotkey;
            }
            if let Some(rules) = patch.rules {
                guard.rules = rules;
            }
            if let Some(dictate_punctuation) = patch.dictate_punctuation {
                guard.dictate_punctuation = dictate_punctuation;
            }
            guard.clone()
        };
        self.persist(&next)?;
        tracing::info!(
            ui_scale = next.ui_scale,
            minimize_to_tray = next.minimize_to_tray,
            theme = ?next.theme,
            hotkey = %next.hotkey,
            "settings updated"
        );
        Ok(next)
    }

    /// Write the document atomically: serialise to `<file>.tmp`, then rename over the target, so a
    /// crash mid-write can never leave a half-written settings file behind.
    fn persist(&self, value: &SettingsDto) -> Result<()> {
        let json = serde_json::to_string_pretty(value)?;
        let tmp = self.path.with_extension("json.tmp");
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| AppError::io(parent.display().to_string(), e))?;
        }
        std::fs::write(&tmp, json).map_err(|e| AppError::io(tmp.display().to_string(), e))?;
        std::fs::rename(&tmp, &self.path)
            .map_err(|e| AppError::io(self.path.display().to_string(), e))?;
        Ok(())
    }
}

/// Clamp values coming from disk — a hand-edited file must not be able to push the UI to an unusable
/// zoom level, and an empty hotkey string would leave the app with no way to record at all.
fn sanitize(mut s: SettingsDto) -> SettingsDto {
    if !s.ui_scale.is_finite() {
        s.ui_scale = 1.0;
    }
    s.ui_scale = s.ui_scale.clamp(MIN_UI_SCALE, MAX_UI_SCALE);
    if s.hotkey.trim().is_empty() {
        tracing::warn!("settings carried an empty hotkey — falling back to the default");
        s.hotkey = SettingsDto::default().hotkey;
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scale(v: f64) -> SettingsPatch {
        SettingsPatch {
            ui_scale: Some(v),
            ..Default::default()
        }
    }

    #[test]
    fn defaults_when_no_file_exists() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        assert_eq!(store.get().ui_scale, 1.0);
        // Huginn keeps running in the tray by default — the hotkey is the product (see dto.rs).
        assert!(store.get().minimize_to_tray);
        assert_eq!(store.get().theme, ThemeChoice::System);
        assert_eq!(store.get().hotkey, "Ctrl+Space");
    }

    #[test]
    fn update_persists_and_reloads() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        let next = store.update(scale(1.25)).expect("update");
        assert_eq!(next.ui_scale, 1.25);

        let reloaded = SettingsStore::load(dir.path());
        assert_eq!(reloaded.get().ui_scale, 1.25);
        assert!(dir.path().join("settings.json").is_file());
    }

    #[test]
    fn ui_scale_is_clamped_on_write_and_read() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        assert_eq!(
            store.update(scale(9.0)).expect("update").ui_scale,
            MAX_UI_SCALE
        );
        assert_eq!(
            store.update(scale(0.1)).expect("update").ui_scale,
            MIN_UI_SCALE
        );

        std::fs::write(dir.path().join("settings.json"), r#"{"ui_scale":42.0}"#).expect("write");
        assert_eq!(SettingsStore::load(dir.path()).get().ui_scale, MAX_UI_SCALE);
    }

    #[test]
    fn corrupt_file_falls_back_to_defaults() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("settings.json"), "not json at all").expect("write");
        assert_eq!(SettingsStore::load(dir.path()).get().ui_scale, 1.0);
    }

    #[test]
    fn a_user_who_wants_huginn_to_quit_on_close_gets_that_and_it_survives_a_restart() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        assert!(
            store.get().minimize_to_tray,
            "the default is to keep running — the hotkey is the product"
        );

        let next = store
            .update(SettingsPatch {
                minimize_to_tray: Some(false),
                ..Default::default()
            })
            .expect("update");
        assert!(!next.minimize_to_tray);
        assert!(!SettingsStore::load(dir.path()).get().minimize_to_tray);
    }

    #[test]
    fn theme_and_hotkey_persist_and_reload() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        store
            .update(SettingsPatch {
                theme: Some(ThemeChoice::Light),
                hotkey: Some("Ctrl+Shift+KeyJ".into()),
                ..Default::default()
            })
            .expect("update");

        let reloaded = SettingsStore::load(dir.path()).get();
        assert_eq!(reloaded.theme, ThemeChoice::Light);
        assert_eq!(reloaded.hotkey, "Ctrl+Shift+KeyJ");
    }

    #[test]
    fn older_file_without_the_newer_fields_loads_with_defaults() {
        // A settings file written before `theme` and `hotkey` existed must still load — and must not
        // silently discard the preferences it *does* carry.
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            dir.path().join("settings.json"),
            r#"{"ui_scale":1.25,"minimize_to_tray":true}"#,
        )
        .expect("write");
        let s = SettingsStore::load(dir.path()).get();
        assert_eq!(s.ui_scale, 1.25);
        assert!(s.minimize_to_tray);
        assert_eq!(s.theme, ThemeChoice::System);
        assert_eq!(s.hotkey, "Ctrl+Space");
    }

    #[test]
    fn an_empty_hotkey_on_disk_falls_back_to_the_default() {
        // A hand-edited file must not be able to leave the app with no way to start recording.
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("settings.json"), r#"{"hotkey":"   "}"#).expect("write");
        assert_eq!(SettingsStore::load(dir.path()).get().hotkey, "Ctrl+Space");
    }
}
