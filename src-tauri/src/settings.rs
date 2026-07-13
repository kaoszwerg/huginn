//! Persisted user settings — a small JSON document under `<app_data_dir>/settings.json`.
//!
//! The shell has no database on purpose: settings are a handful of scalar preferences, so a single
//! JSON file (written atomically via a temp file + rename) is the honest fit. Reads are served from
//! an in-memory copy behind an `RwLock`; every write persists immediately, so a crash can never
//! lose more than the write in flight.

use crate::dto::SettingsDto;
use crate::error::{AppError, Result};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub const MIN_UI_SCALE: f64 = 0.7;
pub const MAX_UI_SCALE: f64 = 1.6;

/// Thread-safe settings store: in-memory state + the JSON file it is persisted to.
pub struct SettingsStore {
    path: PathBuf,
    current: RwLock<SettingsDto>,
}

impl SettingsStore {
    /// Load `<data_dir>/settings.json`. A missing or unreadable file yields the defaults — a
    /// corrupt settings file must never stop the app from starting; it is logged and replaced on
    /// the next write.
    pub fn load(data_dir: &Path) -> Self {
        let path = data_dir.join("settings.json");
        let current = match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<SettingsDto>(&raw) {
                Ok(s) => {
                    tracing::info!(
                        path = %path.display(),
                        ui_scale = s.ui_scale,
                        minimize_to_tray = s.minimize_to_tray,
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

    /// Apply a partial update (every field optional), persist it, and return the new state.
    pub fn update(
        &self,
        ui_scale: Option<f64>,
        minimize_to_tray: Option<bool>,
    ) -> Result<SettingsDto> {
        let next = {
            let mut guard = self
                .current
                .write()
                .map_err(|_| AppError::Other("settings lock poisoned".into()))?;
            if let Some(scale) = ui_scale {
                guard.ui_scale = scale.clamp(MIN_UI_SCALE, MAX_UI_SCALE);
            }
            if let Some(tray) = minimize_to_tray {
                guard.minimize_to_tray = tray;
            }
            guard.clone()
        };
        self.persist(&next)?;
        tracing::info!(
            ui_scale = next.ui_scale,
            minimize_to_tray = next.minimize_to_tray,
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

/// Clamp values coming from disk — a hand-edited file must not be able to push the UI to an
/// unusable zoom level.
fn sanitize(mut s: SettingsDto) -> SettingsDto {
    if !s.ui_scale.is_finite() {
        s.ui_scale = 1.0;
    }
    s.ui_scale = s.ui_scale.clamp(MIN_UI_SCALE, MAX_UI_SCALE);
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_no_file_exists() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        assert_eq!(store.get().ui_scale, 1.0);
        assert!(!store.get().minimize_to_tray);
    }

    #[test]
    fn update_persists_and_reloads() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        let next = store.update(Some(1.25), None).expect("update");
        assert_eq!(next.ui_scale, 1.25);

        let reloaded = SettingsStore::load(dir.path());
        assert_eq!(reloaded.get().ui_scale, 1.25);
        assert!(dir.path().join("settings.json").is_file());
    }

    #[test]
    fn ui_scale_is_clamped_on_write_and_read() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        let high = store.update(Some(9.0), None).expect("update");
        assert_eq!(high.ui_scale, MAX_UI_SCALE);
        let low = store.update(Some(0.1), None).expect("update");
        assert_eq!(low.ui_scale, MIN_UI_SCALE);

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
    fn minimize_to_tray_persists_and_reloads() {
        let dir = tempfile::tempdir().expect("tempdir");
        let store = SettingsStore::load(dir.path());
        assert!(!store.get().minimize_to_tray);
        let next = store.update(None, Some(true)).expect("update");
        assert!(next.minimize_to_tray);
        assert!(SettingsStore::load(dir.path()).get().minimize_to_tray);
    }

    #[test]
    fn older_file_without_tray_field_loads_with_default() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("settings.json"), r#"{"ui_scale":1.25}"#).expect("write");
        let s = SettingsStore::load(dir.path()).get();
        assert_eq!(s.ui_scale, 1.25);
        assert!(!s.minimize_to_tray);
    }
}
