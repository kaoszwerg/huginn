//! Push-to-talk: hold the hotkey, an overlay appears over the app you are in, and on release the
//! recognised text is inserted there (ADR-PROJ-004). This module is the **cross-platform half** — the
//! hotkey registration, the single-threaded event loop, the session — and it dispatches to a platform
//! session driver ([`win32::session`] on Windows; a placeholder until macOS lands, PLAN.md phase 1b).
//!
//! It began as the phase-1a spike that decided whether the architecture holds — *can a Tauri window
//! appear over another application without taking its keyboard focus?* It can, and the answer was
//! **measured, not assumed** (the log is the proof, `docs/spike-1a-windows.md`). Three findings from
//! that measurement are load-bearing here, and each broke a plan:
//!
//! * **The window may not be built on the main thread.** Tauri creates a window by posting a message
//!   to its event loop and *waiting for the reply*; doing that from inside the loop (`run_on_main_thread`)
//!   deadlocks it and the app dies. So window work happens on the dedicated worker thread below.
//! * **Building the window takes the focus** — even hidden, even with `focused(false)`. Measured:
//!   `focus_hwnd == overlay_hwnd` the instant `build()` returned. So the overlay is built **once, at
//!   startup**, and a recording only shows and hides it (ADR-PROJ-004 was amended, not the measurement).
//! * **Press and release must not race.** Both arrive from the hotkey thread; a very short tap could
//!   otherwise hide before show and leave the overlay stranded on the user's work.
//!
//! So one dedicated thread owns the overlay *and* the session and processes every event in order; the
//! hotkey handler only sends, never blocks, never touches a window. The platform-specific work — the
//! overlay window, `SendInput`, the caret move — lives in the platform session driver, not here; this
//! file is what stays the same across Windows and macOS.

pub mod hotkey;

// The platform session driver. Windows now; the non-Windows placeholder keeps the cross-platform event
// loop compiling and running everywhere until the macOS implementation lands (PLAN.md phase 1b).
#[cfg(not(target_os = "windows"))]
mod fallback;
#[cfg(target_os = "windows")]
pub mod win32;

use crate::dto::HotkeyStatus;
use crate::error::{AppError, Result};
use crate::settings::SettingsPatch;
use crate::state::AppState;
use std::str::FromStr;
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// The overlay window's label — the one place the string lives.
pub const OVERLAY_LABEL: &str = "overlay";

/// Overlay geometry, in logical pixels.
///
/// A single line of text plus a few pixels — nothing more. The window is exactly the size of the bar
/// it draws: any spare height would render as empty space, and an overlay that takes up more room
/// than it needs is an overlay that draws attention to itself, which is the one thing it must not do
/// (ADR-PROJ-003).
const OVERLAY_WIDTH: f64 = 300.0;
const OVERLAY_HEIGHT: f64 = 34.0;
const OVERLAY_BOTTOM_MARGIN: f64 = 64.0;

/// Overrides for a spike run, so a measurement does not need a rebuild.
const ENV_HOTKEY: &str = "HUGINN_SPIKE_HOTKEY";

/// Keeps the overlay on screen without holding the key — the only way to measure what a *living*
/// transparent window costs over an hour (PLAN.md 1a.3, tauri#15471). It contradicts the product
/// rule that the overlay exists only while recording, which is exactly why it is a measurement
/// switch and not a setting.
const ENV_STICKY_OVERLAY: &str = "HUGINN_SPIKE_OVERLAY_STICKY";

/// What the hotkey thread hands to the overlay worker. Carries the instant the key actually moved,
/// so the latency we report includes the time the message spent in the queue — the number the user
/// feels, not a flattering one.
#[derive(Debug)]
enum PttEvent {
    /// Build the overlay window once, up front. It must exist *before* the first recording: creating
    /// it is what takes the focus (see `win32::overlay`), so it cannot happen while the user is
    /// holding the key.
    CreateOverlay,
    Pressed(Instant),
    Released(Instant),
    /// Put the overlay up and leave it there (measurement only).
    ShowForMeasurement,
}

/// One press-and-hold: the window that had the focus when the key went down, and when it went down.
///
/// `pub(crate)` because the platform session drivers (`win32::session`, `fallback`) take it by
/// reference; its fields stay private — only those descendant modules touch them.
#[derive(Debug)]
pub(crate) struct Session {
    #[cfg(target_os = "windows")]
    target: win32::focus::FocusTarget,
    started: Instant,
    /// Set on key-release to stop the overlay's live level-meter pump (ADR-PROJ-004).
    #[cfg(target_os = "windows")]
    stopping: std::sync::Arc<std::sync::atomic::AtomicBool>,
    /// The level-meter pump thread — joined on release (instant; it does no work).
    #[cfg(target_os = "windows")]
    pump: Option<std::thread::JoinHandle<()>>,
}

/// The event the frontend listens on to learn that push-to-talk changed state.
pub const HOTKEY_STATUS_EVENT: &str = "hotkey://status";

/// Live push-to-talk state: the worker's channel, the shortcut currently held with the OS, and
/// whether the OS actually granted it.
pub struct PttState {
    tx: Sender<PttEvent>,
    /// What is registered right now — needed to *unregister* it before arming a new one.
    current: Mutex<Option<Shortcut>>,
    status: Mutex<HotkeyStatus>,
}

/// Install push-to-talk: start the overlay worker, then arm the hotkey from the user's settings.
///
/// **A failure to arm is not a startup failure.** The app must still run — the user needs its
/// settings window to *fix* the hotkey. The failure is recorded in [`HotkeyStatus`], logged, and
/// shown in the UI (rule:overlay-and-input); it is never swallowed, and it never takes the app down.
pub fn install(app: &AppHandle) -> Result<()> {
    let tx = spawn_overlay_worker(app.clone())?;

    // Build the overlay now, while the app is starting: creating the window takes the foreground
    // (measured — see win32::overlay), and the only moment that is harmless is this one.
    if let Err(e) = tx.send(PttEvent::CreateOverlay) {
        tracing::error!(error = %e, "cannot ask the worker to build the overlay");
    }

    // The environment variable exists for spike measurements (a hotkey that is free on the test
    // machine); the user's setting is the real source.
    let spec =
        std::env::var(ENV_HOTKEY).unwrap_or_else(|_| app.state::<AppState>().settings.get().hotkey);

    app.manage(PttState {
        tx,
        current: Mutex::new(None),
        status: Mutex::new(HotkeyStatus {
            shortcut: spec.clone(),
            registered: false,
            error: Some("not armed yet".to_string()),
        }),
    });

    arm(app, &spec);

    if std::env::var(key_probe_flag()).as_deref() == Ok("1") {
        start_key_probe()?;
    }
    if std::env::var(ENV_STICKY_OVERLAY).as_deref() == Ok("1") {
        tracing::warn!(
            "{ENV_STICKY_OVERLAY}=1: the overlay will stay on screen for measurement. This is not \
             product behaviour — the real overlay exists only while recording (ADR-PROJ-004)."
        );
        let state = app.state::<PttState>();
        if let Err(e) = state.tx.send(PttEvent::ShowForMeasurement) {
            tracing::error!(error = %e, "cannot arm the measurement overlay");
        }
    }
    Ok(())
}

/// Try to make `spec` the live push-to-talk hotkey, replacing whatever is registered now.
///
/// Returns the resulting status rather than an error: "the combination you chose is already taken"
/// is not a program fault, it is a state the user has to see and act on. Every outcome — armed,
/// refused, rejected by the OS — is logged *and* pushed to the UI.
fn arm(app: &AppHandle, spec: &str) -> HotkeyStatus {
    let state = app.state::<PttState>();

    // Give up the old one first: on Windows a second registration of the same combination fails
    // with AlreadyRegistered — against ourselves.
    if let Some(old) = state.current.lock().ok().and_then(|mut c| c.take()) {
        if let Err(e) = app.global_shortcut().unregister(old) {
            tracing::warn!(error = %e, "could not unregister the previous hotkey");
        }
    }

    let status = match register(app, spec) {
        Ok(shortcut) => {
            if let Ok(mut current) = state.current.lock() {
                *current = Some(shortcut);
            }
            tracing::info!(hotkey = %spec, "push-to-talk armed (hold to record)");
            HotkeyStatus {
                shortcut: spec.to_string(),
                registered: true,
                error: None,
            }
        }
        Err(reason) => {
            // Loud: without this key the product does nothing at all.
            tracing::error!(hotkey = %spec, reason = %reason, "push-to-talk is NOT armed");
            HotkeyStatus {
                shortcut: spec.to_string(),
                registered: false,
                error: Some(reason),
            }
        }
    };

    if let Ok(mut slot) = state.status.lock() {
        *slot = status.clone();
    }
    // Tell the UI. A status nobody can see is the same as no status (rule:overlay-and-input).
    if let Err(e) = app.emit(HOTKEY_STATUS_EVENT, status.clone()) {
        tracing::error!(error = %e, "cannot publish the hotkey status to the UI");
    }
    // And tell the tray, which is where the user looks when the window is closed — which, for a
    // background tool, is most of the time.
    crate::tray::refresh_status(app);

    status
}

/// Parse → validate → register. The `Err` string is written for the user, not for the log.
fn register(app: &AppHandle, spec: &str) -> std::result::Result<Shortcut, String> {
    let shortcut = Shortcut::from_str(spec)
        .map_err(|e| format!("“{spec}” is not a valid key combination ({e})."))?;

    // Refuse what the platform is known to reject, *before* the OS does — so the user gets a reason
    // instead of an opaque error code (ADR-PROJ-004).
    hotkey::validate(&shortcut).map_err(|refusal| refusal.reason().to_string())?;

    let tx = app.state::<PttState>().tx.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _shortcut, event| {
            let msg = match event.state() {
                ShortcutState::Pressed => PttEvent::Pressed(Instant::now()),
                ShortcutState::Released => PttEvent::Released(Instant::now()),
            };
            // The handler does nothing but forward: no window calls, no blocking, no locks. It runs
            // on the hotkey thread, and anything it blocked on would stall every hotkey on the
            // system.
            if let Err(e) = tx.send(msg) {
                tracing::error!(error = %e, "overlay worker is gone — push-to-talk is dead");
            }
        })
        .map_err(|e| {
            if e.to_string().contains("AlreadyRegistered") {
                format!(
                    "“{spec}” is already used by another application. Pick a different combination."
                )
            } else {
                format!("The system refused “{spec}” ({e}).")
            }
        })?;

    Ok(shortcut)
}

/// What the UI asks on load: is push-to-talk actually armed?
pub fn status(app: &AppHandle) -> HotkeyStatus {
    app.state::<PttState>()
        .status
        .lock()
        .map(|s| s.clone())
        .unwrap_or_else(|_| HotkeyStatus {
            shortcut: String::new(),
            registered: false,
            error: Some("hotkey state is unavailable".to_string()),
        })
}

/// Change the push-to-talk hotkey.
///
/// The new combination is persisted **only if the OS accepted it** — a setting that stores a
/// shortcut which cannot register would be a preference that lies to the user, and the next start
/// would silently come up with no working key.
pub fn set_hotkey(app: &AppHandle, spec: &str) -> Result<HotkeyStatus> {
    tracing::info!(hotkey = %spec, "set_hotkey");
    let status = arm(app, spec);

    if status.registered {
        app.state::<AppState>().settings.update(SettingsPatch {
            hotkey: Some(spec.to_string()),
            ..Default::default()
        })?;
    }
    Ok(status)
}

/// The single thread that owns the overlay window and the session.
///
/// It must not be the main thread (see the module docs), and it must be exactly *one* thread, so
/// that a press and a release can never be processed out of order.
fn spawn_overlay_worker(app: AppHandle) -> Result<Sender<PttEvent>> {
    let (tx, rx) = channel::<PttEvent>();

    std::thread::Builder::new()
        .name("huginn-overlay".into())
        .spawn(move || {
            let mut session: Option<Session> = None;
            while let Ok(event) = rx.recv() {
                match event {
                    PttEvent::CreateOverlay => create_overlay(&app),
                    PttEvent::Pressed(at) => on_pressed(&app, &mut session, at),
                    PttEvent::Released(at) => on_released(&app, &mut session, at),
                    PttEvent::ShowForMeasurement => on_measurement_overlay(&app),
                }
            }
            tracing::info!("overlay worker stopped");
        })
        .map_err(|e| AppError::Other(format!("cannot spawn the overlay worker: {e}")))?;

    Ok(tx)
}

// The platform session driver — Windows now, macOS on the Mac (PLAN.md phase 1b). The event loop above
// calls these; each dispatches to the implementation compiled for this target. Keeping the dispatch
// here and the implementations in their platform module is what lets this file stay the cross-platform
// half of push-to-talk (ADR-PROJ-004).

fn create_overlay(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    win32::session::create_overlay(app);
    #[cfg(not(target_os = "windows"))]
    fallback::create_overlay(app);
}

fn on_pressed(app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    #[cfg(target_os = "windows")]
    win32::session::on_pressed(app, session, at);
    #[cfg(not(target_os = "windows"))]
    fallback::on_pressed(app, session, at);
}

fn on_released(app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    #[cfg(target_os = "windows")]
    win32::session::on_released(app, session, at);
    #[cfg(not(target_os = "windows"))]
    fallback::on_released(app, session, at);
}

fn on_measurement_overlay(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    win32::session::on_measurement_overlay(app);
    #[cfg(not(target_os = "windows"))]
    fallback::on_measurement_overlay(app);
}

fn key_probe_flag() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        win32::probe::ENV_FLAG
    }
    #[cfg(not(target_os = "windows"))]
    {
        "HUGINN_SPIKE_KEYPROBE"
    }
}

fn start_key_probe() -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        win32::probe::start()
    }
    #[cfg(not(target_os = "windows"))]
    {
        tracing::warn!("the key probe is Windows-only; ignored on this platform");
        Ok(())
    }
}

/// Pure geometry, so the placement is tested without a monitor.
///
/// Everything here is in **physical** pixels: the overlay's size is defined in logical pixels (it
/// must look the same on a 4K laptop as on a 1080p monitor), so it is scaled by the monitor's DPI
/// factor before it can be placed. Mixing the two is the classic way to put a window a third of the
/// way off a HiDPI screen.
fn centre_bottom(screen_w: f64, screen_h: f64, scale: f64) -> (i32, i32) {
    let w = OVERLAY_WIDTH * scale;
    let h = OVERLAY_HEIGHT * scale;
    let margin = OVERLAY_BOTTOM_MARGIN * scale;

    let x = ((screen_w - w) / 2.0).max(0.0);
    let y = (screen_h - h - margin).max(0.0);
    (x as i32, y as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_overlay_sits_centred_above_the_bottom_edge() {
        let (x, y) = centre_bottom(1920.0, 1080.0, 1.0);
        assert_eq!(x, ((1920.0 - OVERLAY_WIDTH) / 2.0) as i32);
        assert_eq!(y, (1080.0 - OVERLAY_HEIGHT - OVERLAY_BOTTOM_MARGIN) as i32);
        assert!(
            (y as f64) + OVERLAY_HEIGHT < 1080.0,
            "must stay on the screen"
        );
    }

    #[test]
    fn the_overlay_is_scaled_to_the_monitors_dpi() {
        // A 4K screen at 200%: the same logical bar is twice as many physical pixels, so both its
        // size and its margin scale. Placing an unscaled window here would leave it stranded near
        // the middle of the screen — the classic HiDPI bug.
        let (x, y) = centre_bottom(3840.0, 2160.0, 2.0);
        assert_eq!(x, ((3840.0 - OVERLAY_WIDTH * 2.0) / 2.0) as i32);
        assert_eq!(
            y,
            (2160.0 - OVERLAY_HEIGHT * 2.0 - OVERLAY_BOTTOM_MARGIN * 2.0) as i32
        );
    }

    #[test]
    fn a_screen_smaller_than_the_overlay_never_yields_a_negative_position() {
        // A tiny virtual display (a remote session) must not push the window off-screen.
        let (x, y) = centre_bottom(200.0, 100.0, 1.0);
        assert!(x >= 0 && y >= 0, "got ({x}, {y})");
    }

    #[test]
    fn a_release_without_a_press_is_ignored_rather_than_panicking() {
        // The hotkey can be released while the app was starting up, or after a session was already
        // closed. Taking from an empty session must be a no-op, not a crash.
        let mut session: Option<Session> = None;
        assert!(session.take().is_none());
    }
}
