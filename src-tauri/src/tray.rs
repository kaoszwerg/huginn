//! The system tray: Huginn's real home (ADR-APP-021, ADR-PROJ-004).
//!
//! Huginn is a background tool. The window is where you configure it; the *product* is a global
//! hotkey that only works while the process lives. Two things follow, and both differ from the shell
//! this was scaffolded from:
//!
//! * **The tray icon is always installed** — not only when "keep running" is on. An app that lives in
//!   the background without a tray icon is an app the user cannot open, cannot quit, and cannot even
//!   tell is running. That is not a preference, it is the only way out.
//! * **The menu says whether push-to-talk is actually armed.** If another application holds the
//!   combination, the user needs to learn that from Huginn, not from the silence where their words
//!   should have appeared (rule:overlay-and-input).
//!
//! `minimize_to_tray` therefore governs only what the **close button** does: keep running (default —
//! the hotkey is the product) or quit.

use crate::state::AppState;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

const TRAY_ID: &str = "app-tray";
const MENU_STATUS: &str = "tray_status";
const MENU_OPEN: &str = "tray_open";
const MENU_QUIT: &str = "tray_quit";

/// Register the main window's close handler. It consults `minimize_to_tray` at event time, so
/// toggling the setting takes effect without a restart.
pub fn install_close_handler(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        tracing::warn!("no main window — close handler not installed");
        return;
    };
    let handle = app.clone();
    window.clone().on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            let keep_running = handle
                .try_state::<AppState>()
                .map(|s| s.settings.get().minimize_to_tray)
                .unwrap_or(true);
            if keep_running {
                api.prevent_close();
                if let Some(w) = handle.get_webview_window("main") {
                    log_if_err(w.hide(), "hide");
                }
                tracing::debug!("window closed — Huginn keeps listening in the tray");
            }
            // else: the close proceeds and the app exits, because the user asked for that.
        }
    });
}

/// Install the tray icon. Called once at startup, unconditionally.
pub fn install(app: &AppHandle) {
    if app.tray_by_id(TRAY_ID).is_some() {
        return;
    }
    match build_tray(app) {
        Ok(()) => tracing::info!("tray installed"),
        Err(e) => {
            // Without the tray, a backgrounded Huginn is unreachable. Loud — but not fatal: the
            // hotkey still works, and the window may still be open.
            tracing::error!(error = %e, "tray could not be installed — Huginn will be hard to reach when its window is closed");
        }
    }
}

/// Rebuild the tray menu so its first line tells the truth about push-to-talk.
///
/// Called whenever the hotkey status changes (armed, re-armed, refused). A menu that still shows a
/// shortcut which no longer works is worse than one that shows nothing.
pub fn refresh_status(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    match build_menu(app) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                tracing::warn!(error = %e, "could not refresh the tray menu");
            }
        }
        Err(e) => tracing::warn!(error = %e, "could not rebuild the tray menu"),
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID);
    builder = match tray_icon(app) {
        Some(icon) => builder.icon(icon),
        None => {
            // Never panic on a missing icon (rule:code-quality). Fall back to the app icon: a
            // colourful tray mark is worse than the monochrome one, but no tray at all is worse
            // still — it is the only way to open or quit a backgrounded Huginn.
            tracing::warn!("monochrome tray icon missing — falling back to the app icon");
            match app.default_window_icon().cloned() {
                Some(icon) => builder.icon(icon),
                None => {
                    tracing::error!("no icon at all — tray not installed");
                    return Ok(());
                }
            }
        }
    };

    builder
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip(app.package_info().name.clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            MENU_OPEN => show_main_window(app),
            MENU_QUIT => {
                // Save window geometry before exit — Quit goes straight to process exit and does not
                // wait for the plugin's own CloseRequested handler.
                use tauri_plugin_window_state::{AppHandleExt, StateFlags};
                if let Err(e) = app.save_window_state(StateFlags::all()) {
                    tracing::warn!(error = %e, "save_window_state on quit failed");
                }
                tracing::info!("quit from tray");
                app.exit(0);
            }
            // MENU_STATUS is disabled; it cannot be clicked.
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

/// The monochrome tray mark, in the tint the user's taskbar needs.
///
/// **Windows does not recolour tray icons.** An app that ships one tint is invisible or muddy on half
/// the desktops out there, so both are bundled and the taskbar's own theme decides — read from the
/// same registry value Explorer uses. macOS is different: it takes a black icon marked as a
/// *template* and inverts it itself, which is why `icon_as_template` is set there and the black one
/// is handed over unconditionally.
fn tray_icon(app: &AppHandle) -> Option<tauri::image::Image<'static>> {
    let file = if wants_dark_icon() {
        "icons/tray-dark.png"
    } else {
        "icons/tray-light.png"
    };

    let path = app.path().resolve(file, BaseDirectory::Resource).ok()?;
    match tauri::image::Image::from_path(&path) {
        Ok(icon) => Some(icon),
        Err(e) => {
            tracing::warn!(error = %e, path = %path.display(), "tray icon could not be loaded");
            None
        }
    }
}

/// Does the taskbar need the light-on-dark icon?
///
/// Windows: `SystemUsesLightTheme = 0` means a dark taskbar, which needs the white mark. The value is
/// missing on older builds — dark is the safer assumption there, because Windows' own default
/// taskbar is dark.
///
/// macOS: always the black template image; the system inverts it for a dark menu bar itself.
fn wants_dark_icon() -> bool {
    #[cfg(target_os = "windows")]
    {
        use windows_registry::CURRENT_USER;

        const KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
        match CURRENT_USER
            .open(KEY)
            .and_then(|k| k.get_u32("SystemUsesLightTheme"))
        {
            Ok(light) => light == 0,
            Err(_) => true,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// The menu. Its first line is a disabled label carrying the one fact that matters: is the dictation
/// key alive, and which one is it?
fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let status = crate::pushtotalk::status(app);
    let label = if status.registered {
        format!("Push-to-talk: {}", status.shortcut)
    } else {
        // Deliberately blunt. This is the state in which the product does nothing at all.
        format!("Push-to-talk INACTIVE ({})", status.shortcut)
    };

    let status_item = MenuItem::with_id(app, MENU_STATUS, label, false, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let open = MenuItem::with_id(
        app,
        MENU_OPEN,
        format!("Open {}", app.package_info().name),
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;

    Menu::with_items(app, &[&status_item, &sep, &open, &quit])
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
        assert_eq!(MENU_STATUS, "tray_status");
        assert_eq!(MENU_OPEN, "tray_open");
        assert_eq!(MENU_QUIT, "tray_quit");
    }
}
