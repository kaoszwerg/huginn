//! Backend library entry point.
//!
//! Wires up logging, application state, the system tray and the Tauri command surface. Domain
//! modules are added alongside these as the app grows — this file stays the single place where the
//! app is assembled.

pub mod commands;
pub mod dto;
pub mod error;
pub mod logging;
pub mod pushtotalk;
pub mod settings;
pub mod speech;
pub mod state;
pub mod tray;

use crate::error::{AppError, Result};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

/// Where the speech models live: `<app-data>/models/` (ADR-PROJ-007 — lowercase, resolved through
/// the platform API, never a hardcoded path).
pub fn models_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("cannot resolve the app data directory: {e}")))?
        .join("models");
    Ok(dir)
}

/// Build and run the Tauri application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Persist + restore window size and position across runs — for the MAIN window only.
        //
        // The overlay is denied on purpose (ADR-PROJ-004). Its geometry and visibility are owned
        // entirely by the push-to-talk code: it is built off-screen and hidden at startup, and shown —
        // on the monitor the user is actually typing on — *only* while the hotkey is held. Letting the
        // window-state plugin persist and restore it is exactly the bug reported on the installed build:
        // the plugin brings the overlay back on screen at startup, and because no key-release ever runs,
        // `hide_overlay` is never called, so it hangs there forever. The plugin must never touch it.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&[crate::pushtotalk::OVERLAY_LABEL])
                .build(),
        )
        // Push-to-talk (ADR-PROJ-004). The hotkey is registered from Rust only, so the webview
        // needs no global-shortcut capability at all (least privilege, ADR-CORE-011).
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Autostart. Off unless the user turns it on — and the OS is the single source of truth for
        // whether it is on (see commands::get_autostart), never a copy in our settings file.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
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

            // Push-to-talk (ADR-PROJ-004). A failure to arm the hotkey — most likely because another
            // application already holds the combination — must not take the app down: the user needs
            // the settings window to fix it. It is never swallowed either; it is shown in the window
            // and in the tray menu (rule:overlay-and-input).
            if let Err(e) = pushtotalk::install(app.handle()) {
                tracing::error!(error = %e, "push-to-talk is NOT available");
            }

            // The tray goes up last, so its menu can already state whether the hotkey is armed. It is
            // installed unconditionally: Huginn lives in the background, and without it the app would
            // have no way to be opened or quit (see tray.rs).
            tray::install(app.handle());

            // The speech worker + model. Loading a model takes hundreds of milliseconds and must not
            // hold up the window — and a fresh install has no model at all, which is a state the app
            // runs in perfectly well (the user is told, and picks one).
            app.manage(speech::SpeechState::new());
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || load_model_at_startup(&handle));

            tracing::info!("startup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::build_info,
            commands::get_recent_logs,
            commands::get_settings,
            commands::update_settings,
            commands::get_hotkey_status,
            commands::set_hotkey,
            commands::get_autostart,
            commands::set_autostart,
            commands::list_microphones,
            commands::set_microphone,
            commands::set_sounds,
            commands::set_rules,
            commands::set_dictate_punctuation,
            commands::list_builtin_commands,
            commands::list_models,
            commands::download_model,
            commands::list_directory,
            commands::import_model,
            commands::set_model,
            commands::list_jobs,
            commands::cancel_job,
            commands::open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while building the Tauri application");
}

/// Load the user's model into the worker, if it is installed.
///
/// **A missing model is not an error.** A fresh install has none — the app runs, says so, and offers
/// to download one. Treating that as a startup failure would mean a first launch that looks broken.
fn load_model_at_startup(app: &tauri::AppHandle) {
    let settings = app.state::<AppState>().settings.get();

    let Ok(dir) = models_dir(app) else {
        tracing::error!("cannot resolve the models directory — speech is unavailable");
        return;
    };

    // First run: the installer ships the default model so dictation works out of the box, without the
    // user downloading anything (ADR-PROJ-006). Shipping it inside the signed installer does **not**
    // exempt it from the checksum — `install_default_if_missing` verifies it against the compiled-in
    // SHA-256 before accepting it. A missing bundle (a dev build) or a mismatch is not fatal: the
    // download path in the settings remains.
    match app.path().resolve(
        format!("resources/models/{}.bin", huginn_models::DEFAULT_MODEL),
        tauri::path::BaseDirectory::Resource,
    ) {
        Ok(bundled) => match huginn_models::install_default_if_missing(&dir, &bundled) {
            Ok(true) => tracing::info!("first run: the bundled model was installed"),
            Ok(false) => {}
            Err(e) => tracing::error!(error = %e, "the bundled model could not be installed"),
        },
        Err(e) => tracing::debug!(error = %e, "no bundled model resource on this build"),
    }

    let path = huginn_models::model_path(&dir, &settings.model);
    if !path.is_file() {
        tracing::info!(
            model = %settings.model,
            "no speech model is installed yet — the user will be asked to download one"
        );
        return;
    }

    match speech::load_model(app, &path) {
        Ok(()) => tracing::info!(model = %settings.model, "speech is ready"),
        Err(e) => {
            // Loud, and shown in the UI — but not fatal: the hotkey, the overlay and the settings all
            // still work, and the user needs them to fix this (rule:logging).
            tracing::error!(error = %e, model = %settings.model, "the speech model could not be loaded");
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_version_matches_cargo_metadata() {
        assert_eq!(super::commands::app_version(), env!("CARGO_PKG_VERSION"));
    }
}
