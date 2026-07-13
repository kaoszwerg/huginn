//! Backend library entry point.
//!
//! Wires up logging, application state, the system tray and the Tauri command surface. Domain
//! modules are added alongside these as the app grows — this file stays the single place where the
//! app is assembled.

pub mod commands;
pub mod dto;
pub mod error;
pub mod logging;
pub mod settings;
pub mod state;
pub mod tray;

use crate::state::AppState;
use tauri::{Emitter, Manager};

/// Build and run the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Persist + restore window size and position across runs.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            logging::init(&data_dir);
            tracing::info!(
                app = %app.package_info().name,
                version = env!("CARGO_PKG_VERSION"),
                data_dir = %data_dir.display(),
                "starting"
            );

            // Bridge live log records to the frontend log view.
            let log_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut rx = logging::subscribe();
                while let Ok(rec) = rx.recv().await {
                    // Deliberately not re-logged on Err: the record is already in the ring buffer +
                    // JSON file, and logging an emit failure would feed back into this same stream.
                    let _ = log_handle.emit("log://record", rec);
                }
            });

            app.manage(AppState::new(&data_dir));
            // Close handler is always registered; it consults the live `minimize_to_tray` setting.
            // The tray icon itself is installed only when the setting is on (default off).
            tray::install_close_handler(app.handle());
            let tray_enabled = app.state::<AppState>().settings.get().minimize_to_tray;
            tray::set_enabled(app.handle(), tray_enabled);
            tracing::info!("startup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::build_info,
            commands::get_recent_logs,
            commands::get_settings,
            commands::update_settings,
            commands::open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while building the Tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_version_matches_cargo_metadata() {
        assert_eq!(super::commands::app_version(), env!("CARGO_PKG_VERSION"));
    }
}
