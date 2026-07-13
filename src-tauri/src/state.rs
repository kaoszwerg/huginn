//! Shared application state held by Tauri (`tauri::Manager`).

use crate::settings::SettingsStore;
use std::path::Path;

/// Process-wide state. Domain services are added here as the app grows.
pub struct AppState {
    pub settings: SettingsStore,
}

impl AppState {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            settings: SettingsStore::load(data_dir),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_loads_settings_from_data_dir() {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(dir.path());
        // A fresh data dir yields the defaults.
        assert_eq!(state.settings.get().ui_scale, 1.0);
        assert!(!state.settings.get().minimize_to_tray);
    }
}
