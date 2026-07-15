//! Backend library entry point.
//!
//! Wires up logging, application state, the system tray and the Tauri command surface. Domain
//! modules are added alongside these as the app grows — this file stays the single place where the
//! app is assembled.

pub mod commands;
pub mod crash;
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
use tokio::sync::broadcast::error::RecvError;

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
///
/// This is the process's entry point, and the last thing that can report a failure to the user
/// (ADR-CORE-037): the panic hook goes in **first** — before the builder, before logging — because a
/// panic while resolving the app data dir happens before either exists. `main.rs` builds with
/// `windows_subsystem = "windows"`, so there is no console to fall back on; nothing here may die
/// silently.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crash::install_panic_hook();

    let result = tauri::Builder::default()
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
            // Tauri turns an `Err` from this closure into `panic!("Failed to setup app: {e}")`
            // (tauri 2.11, app.rs) — it never reaches `run()`'s `Result`, and the panic hook would then
            // report EXIT_PANIC for what is really a startup failure. So it is handled here, with the
            // exit code that says what actually happened (ADR-CORE-037).
            if let Err(e) = setup(app) {
                crash::fatal(
                    "startup",
                    "Huginn could not start.",
                    &format!("setup failed: {e:#}"),
                    crash::EXIT_STARTUP,
                );
            }
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
            commands::set_streaming,
            commands::set_stream_sensitivity,
            commands::list_builtin_commands,
            commands::list_models,
            commands::download_model,
            commands::list_directory,
            commands::import_model,
            commands::set_model,
            commands::list_jobs,
            commands::cancel_job,
            commands::open_external,
            // No entry point dies silently (ADR-CORE-037, ADR-APP-032).
            commands::report_crash,
            commands::pending_crash,
            commands::exit_after_crash,
        ])
        .run(tauri::generate_context!());

    // Reached only when the BUILDER failed (a bad context, a window that could not be constructed) —
    // `App::run` exits the process itself on the happy path. Formerly a bare `.expect()`: a panic into a
    // stderr that a `windows_subsystem = "windows"` release build has no one reading (ADR-APP-032).
    if let Err(e) = result {
        crash::fatal(
            "startup",
            "Huginn could not start.",
            &format!("tauri failed to build: {e:#}"),
            crash::EXIT_STARTUP,
        );
    }
}

/// Everything the app needs before the first frame. Fallible on purpose: the caller turns any failure
/// into a reported, recorded, deliberate exit (ADR-CORE-037) instead of a silent one.
fn setup(app: &mut tauri::App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    // Point the crash path at the real app data dir; until now reports went to the temp dir.
    crash::set_data_dir(&data_dir);
    logging::init(&data_dir);
    tracing::info!(
        app = %app.package_info().name,
        version = env!("CARGO_PKG_VERSION"),
        data_dir = %data_dir.display(),
        "starting"
    );

    // Bridge live log records to the frontend log view. A `broadcast` receiver returns `Lagged` when the
    // UI falls behind — recoverable, so warn and keep bridging; the old `while let Ok(..)` loop ended here
    // and silently froze the log view for the rest of the session (ADR-CORE-037). It ends only on
    // `Closed` (logging is shutting down).
    let log_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        let mut rx = logging::subscribe();
        loop {
            match rx.recv().await {
                Ok(rec) => {
                    // Not re-logged on an emit failure: the record is already in the ring buffer + JSON
                    // file, and logging it would feed back into this same stream.
                    let _ = log_handle.emit("log://record", rec);
                }
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "log bridge fell behind; records dropped");
                }
                Err(RecvError::Closed) => {
                    tracing::debug!("log bridge closed");
                    break;
                }
            }
        }
    });

    app.manage(AppState::new(&data_dir));
    // Close handler is always registered; it consults the live `minimize_to_tray` setting. The tray icon
    // itself is installed only when the setting is on (default off).
    tray::install_close_handler(app.handle());

    // Push-to-talk (ADR-PROJ-004). A failure to arm the hotkey — most likely another app already holds
    // the combination — must not take the app down: the user needs the settings window to fix it. It is
    // never swallowed either; it is shown in the window and the tray menu (rule:overlay-and-input).
    if let Err(e) = pushtotalk::install(app.handle()) {
        tracing::error!(error = %e, "push-to-talk is NOT available");
    }

    // The tray goes up last, so its menu can already state whether the hotkey is armed. Installed
    // unconditionally: Huginn lives in the background, and without it it could not be opened or quit.
    tray::install(app.handle());

    // The speech worker + model. Loading a model takes hundreds of milliseconds and must not hold up the
    // window — and a fresh install has no model at all, a state the app runs in perfectly well.
    app.manage(speech::SpeechState::new());
    let handle = app.handle().clone();
    tauri::async_runtime::spawn_blocking(move || load_model_at_startup(&handle));

    tracing::info!("startup complete");
    Ok(())
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
