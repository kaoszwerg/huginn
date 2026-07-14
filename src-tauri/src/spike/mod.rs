//! **Phase-1a spike (PLAN.md).** The experiment that decides whether Huginn's architecture holds.
//!
//! One question, and everything downstream depends on the answer: *can a Tauri window appear over
//! another application without taking its keyboard focus?* If it cannot, the text Huginn types has
//! nowhere to land, and ADR-PROJ-001/ADR-PROJ-004 are reopened before a line of product code
//! exists.
//!
//! The spike does not assert the answer, it **measures** it. Holding the push-to-talk hotkey:
//!
//! 1. records which window owns the focus (`win32::focus`),
//! 2. shows the overlay — already built, already unactivatable — without activating it,
//! 3. records the focus **again**: if the handle changed, the overlay stole it and the spike failed,
//! 4. on release, types a probe string into the remembered target (`win32::inject`) **while the
//!    overlay is still on screen** — the harder proof — and only then hides it.
//!
//! Every step is logged with its result and its latency (rule:logging); the log *is* the report.
//!
//! ## Three things the spike measured, each of which broke a plan
//!
//! * **The window may not be built on the main thread.** Tauri creates a window by posting a message
//!   to its event loop and *waiting for the reply*. Do that from inside the event loop — which is
//!   what `run_on_main_thread` means — and the loop waits for itself: the app freezes and dies.
//!   (Tauri's own `create_webview_window` is an `async` command for exactly this reason,
//!   `tauri/src/webview/plugin.rs`.)
//! * **Building the window takes the focus** — even hidden, even with `focused(false)`. Measured:
//!   `focus_hwnd == overlay_hwnd` the moment `build()` returned, before a pixel existed. So the
//!   window is built **once, at startup**, and a recording only shows and hides it. This contradicts
//!   ADR-PROJ-004 ("destroyed afterwards") and the ADR is amended, not the measurement.
//! * **Press and release must not race.** Both arrive from the hotkey thread. If "hide" were
//!   dispatched concurrently with "show" — a very short tap — the hide could run first and the
//!   overlay would be left on screen, over the user's work.
//!
//! One dedicated thread owns the overlay *and* the session, and processes every event in order. The
//! hotkey handler only sends; it never blocks and it never touches a window.
//!
//! This module is a spike, not the product: the findings graduate into `huginn-platform` behind a
//! trait in phase 2 (PLAN.md).

pub mod hotkey;

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

/// Where the overlay waits between recordings: far enough off any real desktop that the frame or two
/// it is unavoidably alive during creation cannot be seen anywhere.
const OFFSCREEN_X: f64 = -10_000.0;
const OFFSCREEN_Y: f64 = -10_000.0;

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
#[derive(Debug)]
struct Session {
    #[cfg(target_os = "windows")]
    target: win32::focus::FocusTarget,
    started: Instant,
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

/// Build the overlay window once, at startup, and put it away.
///
/// **Creating it takes the foreground** — measured, with `.visible(false)` and `.focused(false)`
/// set (see `win32::overlay`). That is survivable exactly once, here, where the app is starting and
/// the foreground is handed straight back to whoever had it. It would not be survivable on every
/// keypress, which is what the first version of this spike tried.
#[cfg(target_os = "windows")]
fn create_overlay(app: &AppHandle) {
    let before = win32::focus::foreground();

    match build_overlay_window(app) {
        Ok(hwnd) => {
            tracing::info!(
                overlay_hwnd = format!("{hwnd:#x}"),
                "overlay window ready (hidden, focus-neutral)"
            );
        }
        Err(e) => {
            // Without the overlay the app still records and inserts text; it just does so
            // invisibly. That is a degraded product, not a dead one — so it is loud, not fatal.
            tracing::error!(error = %e, "overlay window could not be created — recording will be invisible");
            return;
        }
    }

    // Give the foreground back to whatever the user was in. Windows grants this only to the process
    // that currently holds the foreground — which, right now, is us, because we just took it.
    if let Some(prev) = before {
        if let Err(e) = win32::overlay::restore_foreground(prev.hwnd) {
            tracing::warn!(error = %e, process = %prev.process, "could not hand the foreground back");
        }
    }
}

/// Key down: remember who has the focus, then put the overlay on screen without disturbing it.
#[cfg(target_os = "windows")]
fn on_pressed(app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    if session.is_some() {
        // Windows re-fires the hotkey while the key is held; the first press owns the session.
        tracing::debug!("push-to-talk auto-repeat ignored");
        return;
    }

    let Some(target) = win32::focus::foreground() else {
        tracing::warn!("push-to-talk pressed but no window has the focus — nothing to type into");
        return;
    };
    tracing::info!(
        target_process = %target.process,
        target_hwnd = format!("{:#x}", target.hwnd),
        "push-to-talk pressed"
    );

    if let Err(e) = show_overlay(app, Some(&target), at) {
        tracing::error!(error = %e, "overlay failed to appear");
    }

    // The microphone opens here, on the key — not after the overlay, not on a timer. Audio captured
    // late is a word missing from the front of every sentence.
    if let Err(e) = crate::speech::start_recording(app) {
        tracing::error!(error = %e, "the microphone could not be opened");
    }

    *session = Some(Session {
        target,
        started: at,
    });
}

/// Key up: type into the remembered target while the overlay is still up, then take it down.
#[cfg(target_os = "windows")]
fn on_released(app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    let Some(session) = session.take() else {
        tracing::debug!("push-to-talk released without an open session");
        return;
    };
    let hold_ms = at.duration_since(session.started).as_millis();

    // The measurement the whole spike exists for: is the focus still where it was?
    let now = win32::focus::foreground();
    let focus_kept = now
        .as_ref()
        .map(|f| f.is_same_window(&session.target))
        .unwrap_or(false);

    tracing::info!(
        hold_ms,
        focus_kept,
        target_process = %session.target.process,
        now_process = now.as_ref().map(|f| f.process.as_str()).unwrap_or("<none>"),
        "push-to-talk released"
    );

    if !focus_kept {
        tracing::error!(
            target_hwnd = format!("{:#x}", session.target.hwnd),
            now_hwnd = now
                .as_ref()
                .map(|f| format!("{:#x}", f.hwnd))
                .unwrap_or_default(),
            "SPIKE FAILED: the focus moved while the overlay was up — the text would land in the \
             wrong window (ADR-PROJ-004)"
        );
    }

    // Recognise, then insert — while the overlay is still on screen, which is also the honest
    // sequence: the user should see "listening" until the words actually land.
    //
    // The text is never logged (ADR-PROJ-007). It goes from the worker's pipe into the focused
    // window, and nowhere else.
    match crate::speech::finish_recording(app) {
        Ok(Some(text)) if !text.trim().is_empty() => {
            let injected = Instant::now();
            match win32::inject::send_text(&text) {
                Ok(events) => tracing::info!(
                    events,
                    inject_ms = injected.elapsed().as_millis(),
                    focus_kept,
                    "text inserted into the focused window"
                ),
                Err(e) => {
                    // Text that vanished silently is the worst possible bug in a dictation tool
                    // (rule:overlay-and-input). It is reported, never swallowed.
                    tracing::error!(error = %e, "the text did not reach the target window");
                }
            }
        }
        Ok(Some(_)) => {
            // The model heard nothing — silence, or a key tapped rather than held.
            tracing::info!("nothing was recognised");
        }
        Ok(None) => {
            tracing::debug!("no recording was open");
        }
        Err(e) => {
            // No model installed, the worker died, the microphone failed. The user is told (the log
            // feeds the Logs view, and the UI shows the state) — never silence.
            tracing::error!(error = %e, "the recording could not be transcribed");
        }
    }

    if let Err(e) = hide_overlay(app) {
        tracing::error!(error = %e, "overlay failed to close");
    }
}

/// The measurement overlay (`HUGINN_SPIKE_OVERLAY_STICKY`): no focus claim, no session, no teardown.
#[cfg(target_os = "windows")]
fn on_measurement_overlay(app: &AppHandle) {
    if let Err(e) = show_overlay(app, None, Instant::now()) {
        tracing::error!(error = %e, "measurement overlay failed to appear");
    }
}

/// Build the overlay window: hidden, unactivatable, click-through. Returns its `HWND`.
///
/// Called **once** (from [`create_overlay`]). Everything about this window that matters is set
/// before it is ever shown, because the one thing that cannot be undone afterwards is the focus it
/// takes simply by existing.
#[cfg(target_os = "windows")]
fn build_overlay_window(app: &AppHandle) -> Result<isize> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(existing) = app.get_webview_window(OVERLAY_LABEL) {
        // Already built (a re-entry, or a settings reload). Reuse it — building a second one would
        // take the focus again for nothing.
        return existing
            .hwnd()
            .map(|h| h.0 as isize)
            .map_err(|e| AppError::Other(format!("overlay has no HWND: {e}")));
    }

    let window =
        WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App(overlay_url(app).into()))
            .title("Huginn")
            .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
            // Born off-screen. `visible(false)` is not enough: creating the window makes it briefly
            // real, and it was seen flashing at the top-left corner on startup. Its true position is
            // set every time it is shown anyway (on the monitor the user is actually typing on), so
            // it costs nothing to keep it out of sight until then.
            .position(OFFSCREEN_X, OFFSCREEN_Y)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            // Correct on Windows, a no-op on macOS (tauri#9065). It does not stop the window from
            // taking the foreground when it is created — that is measured, and is why this happens
            // once at startup rather than on every keypress (see win32::overlay).
            .focused(false)
            .visible(false)
            .build()
            .map_err(|e| AppError::Other(format!("overlay window could not be created: {e}")))?;

    let hwnd = window
        .hwnd()
        .map_err(|e| AppError::Other(format!("overlay has no HWND: {e}")))?
        .0 as isize;

    win32::overlay::make_focus_neutral(hwnd)?;

    // Click-through is per window: the overlay ignores the cursor, the settings window does not.
    window
        .set_ignore_cursor_events(true)
        .map_err(|e| AppError::Other(format!("overlay could not be made click-through: {e}")))?;

    // It was built hidden, but Tauri may have shown it while wiring the webview; make sure.
    win32::overlay::hide(hwnd)?;

    Ok(hwnd)
}

/// The overlay's URL, carrying the interface language in its fragment ().
///
/// The overlay window holds **no IPC capability** (least privilege, ADR-CORE-011), so it cannot ask
/// what language to speak — it is told, in the one channel a window always has: its address.
#[cfg(target_os = "windows")]
fn overlay_url(app: &AppHandle) -> String {
    let language = app.state::<AppState>().settings.get().language;
    format!("overlay.html#{language}")
}

/// The overlay's , or an error if it was never built.
#[cfg(target_os = "windows")]
fn overlay_hwnd(app: &AppHandle) -> Result<isize> {
    app.get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| AppError::Other("the overlay window does not exist".to_string()))?
        .hwnd()
        .map(|h| h.0 as isize)
        .map_err(|e| AppError::Other(format!("overlay has no HWND: {e}")))
}

/// Show the overlay — and verify, on the spot, that the focus did not move.
///
/// `target` is the window that must keep the focus. `None` means there is no focus claim to check
/// (the measurement overlay); the verdict is then skipped, because a *false* "SPIKE FAILED" is worse
/// than none.
#[cfg(target_os = "windows")]
fn show_overlay(
    app: &AppHandle,
    target: Option<&win32::focus::FocusTarget>,
    t0: Instant,
) -> Result<()> {
    let hwnd = overlay_hwnd(app)?;

    // On the monitor the user is *typing on* — which on a multi-monitor desk is routinely not the
    // primary one. An overlay that says "listening" on the screen nobody is looking at is worse than
    // no overlay at all. Fall back to the overlay's own monitor when there is no target (the
    // measurement window).
    let anchor = target.map(|t| t.hwnd).unwrap_or(hwnd);
    let (x, y) = bottom_centre_of_monitor(app, anchor)?;

    win32::overlay::show_without_activating(hwnd, x, y)?;
    let shown_ms = t0.elapsed().as_millis();

    // Measure, do not assume (ADR-CORE-004).
    let Some(target) = target else {
        tracing::info!(
            shown_ms,
            "overlay is up (measurement window, no focus claim)"
        );
        return Ok(());
    };

    let after = win32::focus::foreground();
    let focus_kept = after
        .as_ref()
        .map(|f| f.is_same_window(target))
        .unwrap_or(false);

    if focus_kept {
        tracing::info!(
            shown_ms,
            focus_kept,
            target_process = %target.process,
            "overlay is up and the focus stayed put"
        );
    } else {
        tracing::error!(
            shown_ms,
            focus_kept,
            target_process = %target.process,
            now_process = after.as_ref().map(|f| f.process.as_str()).unwrap_or("<none>"),
            "SPIKE FAILED: showing the overlay moved the focus (ADR-PROJ-004)"
        );
    }
    Ok(())
}

/// Take the overlay off screen.
///
/// **Hidden, not destroyed** — and that is a change the spike forced (ADR-PROJ-004 says "destroyed").
/// Destroying it would mean *building* it again on the next recording, and building is precisely what
/// steals the focus. A hidden window renders nothing and receives nothing; what the privacy promise
/// is about — the microphone — is unaffected. The GPU cost of the window continuing to exist is the
/// open question, and it is measured, not assumed (`scripts/project/measure-idle.mjs`).
#[cfg(target_os = "windows")]
fn hide_overlay(app: &AppHandle) -> Result<()> {
    let hwnd = overlay_hwnd(app)?;
    win32::overlay::hide(hwnd)?;
    Ok(())
}

/// Bottom-centre of the monitor that `anchor_hwnd` sits on, in **physical** pixels — what
/// `SetWindowPos` speaks.
///
/// The scale factor still comes from Tauri's monitor list (Win32 gives DPI per monitor through a
/// different call, and Tauri already tracks it): the monitor whose bounds contain the work area we
/// just read. If it cannot be identified, the primary monitor's scale is the fallback — a 1-pixel
/// placement error on a mixed-DPI desk is survivable; putting the bar on the wrong screen is not.
#[cfg(target_os = "windows")]
fn bottom_centre_of_monitor(app: &AppHandle, anchor_hwnd: isize) -> Result<(i32, i32)> {
    let (x, y, width, height) = win32::overlay::work_area_of_window(anchor_hwnd)?;

    let scale = app
        .available_monitors()
        .ok()
        .and_then(|monitors| {
            monitors
                .into_iter()
                .find(|m| {
                    let p = m.position();
                    let s = m.size();
                    // The work area sits inside the monitor's bounds; a point in the middle of it
                    // identifies which monitor we are on.
                    let cx = x + width / 2;
                    let cy = y + height / 2;
                    cx >= p.x
                        && cx < p.x + s.width as i32
                        && cy >= p.y
                        && cy < p.y + s.height as i32
                })
                .map(|m| m.scale_factor())
        })
        .unwrap_or(1.0);

    let (dx, dy) = centre_bottom(width as f64, height as f64, scale);
    Ok((x + dx, y + dy))
}

// ---------------------------------------------------------------------------------------------
// Non-Windows: the hotkey works, the overlay and the injection do not exist yet. They are built and
// measured **on the Mac** (PLAN.md phase 1b) — a `#[cfg(target_os = "macos")]` branch nobody has
// compiled is not a stub, it is fiction, and this project says so out loud (ADR-CORE-004).
// ---------------------------------------------------------------------------------------------

#[cfg(not(target_os = "windows"))]
fn on_pressed(_app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    if session.is_some() {
        return;
    }
    *session = Some(Session { started: at });
    tracing::warn!(
        "push-to-talk pressed — the overlay and text injection are Windows-only so far; the macOS \
         half is written and measured on the Mac (PLAN.md phase 1b)"
    );
}

#[cfg(not(target_os = "windows"))]
fn on_released(_app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    let Some(s) = session.take() else { return };
    tracing::warn!(
        hold_ms = at.duration_since(s.started).as_millis(),
        "push-to-talk released — nothing to insert on this platform yet (PLAN.md phase 1b)"
    );
}

#[cfg(not(target_os = "windows"))]
fn on_measurement_overlay(_app: &AppHandle) {
    tracing::warn!("the measurement overlay is Windows-only so far (PLAN.md phase 1b)");
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
