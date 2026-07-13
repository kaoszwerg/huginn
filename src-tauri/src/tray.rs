//! System-tray icon + close-to-tray behaviour (ADR-APP-021), gated by the `minimize_to_tray` setting
//! (default **off**).
//!
//! When enabled: a tray icon with an Open/Quit menu is installed, left-clicking the icon toggles the
//! main window, and the window's close button hides it to the tray instead of quitting (Quit is the
//! only real exit and saves the window geometry first). The tray installs/removes **live** when the
//! setting changes; the window close handler consults the setting per event, so no restart is needed.

use crate::state::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

const TRAY_ID: &str = "app-tray";
const MENU_OPEN: &str = "tray_open";
const MENU_QUIT: &str = "tray_quit";

/// Register the main window's close handler once. It consults `minimize_to_tray` at event time:
/// when on, the close button hides the window to the tray (the app keeps running); when off, the
/// close proceeds and the app exits. Registered regardless of the current setting, so toggling the
/// setting at runtime takes effect without re-registering anything.
pub fn install_close_handler(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        tracing::warn!("no main window — close handler not installed");
        return;
    };
    let handle = app.clone();
    window.clone().on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let minimize = handle
                .try_state::<AppState>()
                .map(|s| s.settings.get().minimize_to_tray)
                .unwrap_or(false);
            if minimize {
                api.prevent_close();
                if let Some(w) = handle.get_webview_window("main") {
                    log_if_err(w.hide(), "hide");
                }
                tracing::debug!("close request — hidden to tray");
            }
            // else: allow the close to proceed → the app exits (normal windowed behaviour).
        }
    });
}

/// Install or remove the tray icon to match `minimize_to_tray`. Idempotent: enabling when the tray
/// already exists (or disabling when it is absent) is a no-op. Lets the setting take effect live.
pub fn set_enabled(app: &AppHandle, enabled: bool) {
    if enabled {
        if app.tray_by_id(TRAY_ID).is_none() {
            match build_tray(app) {
                Ok(()) => tracing::info!("tray enabled"),
                Err(e) => tracing::error!(error = %e, "tray install failed"),
            }
        }
    } else if app.remove_tray_by_id(TRAY_ID).is_some() {
        tracing::info!("tray disabled");
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon().cloned() else {
        // Never panic on a missing bundled icon (rule:code-quality); skip the tray and log instead.
        tracing::error!("no bundled window icon — tray not installed");
        return Ok(());
    };
    let menu = build_menu(app)?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(app.package_info().name.clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            MENU_OPEN => show_main_window(app),
            MENU_QUIT => {
                // Save window geometry before exit — Quit goes straight to process exit and
                // doesn't wait for the plugin's own CloseRequested handler.
                use tauri_plugin_window_state::{AppHandleExt, StateFlags};
                if let Err(e) = app.save_window_state(StateFlags::all()) {
                    tracing::warn!(error = %e, "save_window_state on quit failed");
                }
                tracing::info!("quit from tray");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let open = MenuItem::with_id(
        app,
        MENU_OPEN,
        format!("Open {}", app.package_info().name),
        true,
        None::<&str>,
    )?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;
    Menu::with_items(app, &[&open, &sep, &quit])
}

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        log_if_err(w.show(), "show");
        log_if_err(w.unminimize(), "unminimize");
        log_if_err(w.set_focus(), "set_focus");
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(false);
        let focused = w.is_focused().unwrap_or(false);
        if visible && focused {
            log_if_err(w.hide(), "hide");
        } else {
            log_if_err(w.show(), "show");
            log_if_err(w.unminimize(), "unminimize");
            log_if_err(w.set_focus(), "set_focus");
        }
    }
}

/// Log a best-effort window operation's failure instead of silently discarding it (rule:code-quality).
fn log_if_err(res: tauri::Result<()>, op: &str) {
    if let Err(e) = res {
        tracing::debug!(error = %e, op, "tray window op failed");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_and_tray_ids_are_stable() {
        // These ids are the tray-menu contract; pinning them keeps a rename from silently breaking
        // the menu-event routing (rule:testing).
        assert_eq!(TRAY_ID, "app-tray");
        assert_eq!(MENU_OPEN, "tray_open");
        assert_eq!(MENU_QUIT, "tray_quit");
    }
}
