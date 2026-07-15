//! The Windows implementation of the push-to-talk session: what happens between the key going down and
//! the text landing (ADR-PROJ-004).
//!
//! This is the platform half. The cross-platform coordination — registering the hotkey, the
//! single-threaded event loop, the [`Session`] — lives in the parent module; everything here is
//! Windows-specific (the overlay window, `SendInput`, the caret move, the focus tracking) and the whole
//! `win32` module is `#[cfg(target_os = "windows")]`, so nothing here needs its own gate. The macOS
//! counterpart joins as a sibling, on the Mac (PLAN.md phase 1b), and the parent dispatches to whichever
//! one is compiled.

use super::{focus, inject, overlay};
use crate::error::{AppError, Result};
use crate::pushtotalk::{centre_bottom, Session, OVERLAY_HEIGHT, OVERLAY_LABEL, OVERLAY_WIDTH};
use crate::state::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Manager};

/// Where the overlay waits between recordings: far enough off any real desktop that the frame or two it
/// is unavoidably alive during creation cannot be seen anywhere. A Windows overlay-building detail, so it
/// lives with the code that uses it, not in the cross-platform parent.
const OFFSCREEN_X: f64 = -10_000.0;
const OFFSCREEN_Y: f64 = -10_000.0;

/// Build the overlay window once, at startup, and put it away.
///
/// **Creating it takes the foreground** — measured, with `.visible(false)` and `.focused(false)` set
/// (see `win32::overlay`). That is survivable exactly once, here, where the app is starting and the
/// foreground is handed straight back to whoever had it. It would not be survivable on every keypress,
/// which is what the first version of this spike tried.
pub(crate) fn create_overlay(app: &AppHandle) {
    let before = focus::foreground();

    match build_overlay_window(app) {
        Ok(hwnd) => {
            tracing::info!(
                overlay_hwnd = format!("{hwnd:#x}"),
                "overlay window ready (hidden, focus-neutral)"
            );
        }
        Err(e) => {
            // Without the overlay the app still records and inserts text; it just does so invisibly.
            // That is a degraded product, not a dead one — so it is loud, not fatal.
            tracing::error!(error = %e, "overlay window could not be created — recording will be invisible");
            return;
        }
    }

    // Give the foreground back to whatever the user was in. Windows grants this only to the process that
    // currently holds the foreground — which, right now, is us, because we just took it.
    if let Some(prev) = before {
        if let Err(e) = overlay::restore_foreground(prev.hwnd) {
            tracing::warn!(error = %e, process = %prev.process, "could not hand the foreground back");
        }
    }
}

/// Key down: remember who has the focus, then put the overlay on screen without disturbing it.
pub(crate) fn on_pressed(app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    if session.is_some() {
        // Windows re-fires the hotkey while the key is held; the first press owns the session.
        tracing::debug!("push-to-talk auto-repeat ignored");
        return;
    }

    let Some(target) = focus::foreground() else {
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

    // Streaming (ADR-PROJ-011): one pump drives the overlay's level meter AND cuts, transcribes and
    // inserts silence-bounded segments while the key is still held — so text appears as the user speaks,
    // not only after release. `stopping` lets the key-release stop it cleanly; `inserted` records whether
    // any segment already produced text, so an empty final tail after a full dictation still reads "done".
    let stopping = Arc::new(AtomicBool::new(false));
    let inserted = Arc::new(AtomicBool::new(false));
    let pump = start_stream_pump(app, stopping.clone(), inserted.clone());

    *session = Some(Session {
        target,
        started: at,
        stopping,
        pump: Some(pump),
        inserted,
    });
}

/// The streaming pump (ADR-PROJ-011). While the key is held it drives the overlay level meter and,
/// whenever a silence-bounded segment is ready, transcribes and inserts it — so the text lands as the
/// user speaks. It runs until `stopping` is set on key-release, then settles the meter.
///
/// **Sequential by construction:** one segment is transcribed and inserted before the next is even cut,
/// so words can never arrive out of order; and the key-release joins this thread *before* transcribing
/// the final tail, so the tail can never interleave with a streamed segment.
///
/// The overlay is pushed with `eval` (ADR-PROJ-004): it holds no IPC capability and is told, never asks.
fn start_stream_pump(
    app: &AppHandle,
    stopping: Arc<AtomicBool>,
    inserted: Arc<AtomicBool>,
) -> std::thread::JoinHandle<()> {
    let app = app.clone();
    std::thread::spawn(move || {
        while !stopping.load(Ordering::Relaxed) {
            if let Some(level) = crate::speech::recording_level(&app) {
                push_level(&app, level);
            }
            match crate::speech::stream_segment(&app) {
                Ok(Some(processed)) if !processed.text.is_empty() => {
                    if inject_processed(&processed) {
                        inserted.store(true, Ordering::Relaxed);
                    }
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(error = %e, "a streamed segment could not be transcribed")
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(120));
        }
        // The recording ended: let the meter settle back to rest rather than freeze at the last value.
        push_level(&app, 0.0);
    })
}

/// Insert processed text into the focused window, applying a macro's `{cursor}` placeholder. Returns
/// whether the text actually reached the window (SendInput events were produced). Shared by the streaming
/// pump and the final-tail path so both insert identically (ADR-PROJ-010, rule:reusability).
fn inject_processed(processed: &huginn_text::Processed) -> bool {
    let started = Instant::now();
    match inject::send_text(&processed.text) {
        Ok(events) => {
            tracing::info!(
                events,
                inject_ms = started.elapsed().as_millis(),
                "text inserted into the focused window"
            );
            // A macro's {cursor} placeholder: put the caret where the user asked (ADR-PROJ-010).
            if let Some(steps) = processed.cursor_from_end {
                if let Err(e) = inject::move_caret_left(steps) {
                    tracing::warn!(error = %e, "could not reposition the caret after a macro");
                }
            }
            true
        }
        Err(e) => {
            // Text that vanished silently is the worst possible bug in a dictation tool
            // (rule:overlay-and-input). It is reported, never swallowed.
            tracing::error!(error = %e, "the text did not reach the target window");
            false
        }
    }
}

/// Push one level value into the capability-less overlay window.
fn push_level(app: &AppHandle, level: f32) {
    if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = overlay.eval(format!(
            "window.__huginnLevel && window.__huginnLevel({level:.3})"
        ));
    }
}

/// Push the overlay's state — `listening` while the key is held, `working` while whisper runs,
/// `done`/`error` after (ADR-PROJ-004). Same push channel as the level and the language: the overlay
/// holds no IPC capability and cannot subscribe to anything, so it is *told*. The state names are a
/// fixed vocabulary the overlay script (`src/overlay/main.ts`) pins — never free text.
fn push_state(app: &AppHandle, state: &str) {
    if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = overlay.eval(format!(
            "window.__huginnState && window.__huginnState('{state}')"
        ));
    }
}

/// Key up: type into the remembered target while the overlay is still up, then take it down.
pub(crate) fn on_released(app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    let Some(mut session) = session.take() else {
        tracing::debug!("push-to-talk released without an open session");
        return;
    };
    let hold_ms = at.duration_since(session.started).as_millis();

    // Freeze the microphone at THIS instant — the key-up — before doing anything slow. The pump join
    // below can take as long as an in-flight segment's transcription (seconds on CPU); if the microphone
    // stayed open across it, the final tail would swallow every second the user spent after letting go
    // (measured: a 23.7 s tail for a 13.6 s hold). Pausing first makes the tail only the held audio.
    crate::speech::stop_capturing(app);

    // Stop the streaming pump and WAIT for it to finish its current segment, so the final tail is
    // transcribed and inserted strictly AFTER every streamed segment — never interleaved (ADR-PROJ-011).
    session.stopping.store(true, Ordering::Relaxed);
    if let Some(pump) = session.pump.take() {
        let _ = pump.join();
    }
    let streamed_any = session.inserted.load(Ordering::Relaxed);

    // Is the focus still where it was?
    let now = focus::foreground();
    let focus_kept = now
        .as_ref()
        .map(|f| f.is_same_window(&session.target))
        .unwrap_or(false);

    tracing::info!(
        hold_ms,
        focus_kept,
        streamed_any,
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
            "the focus moved while the overlay was up — the text would land in the wrong window \
             (ADR-PROJ-004)"
        );
    }

    // Show "working" for the final tail: whatever audio is left after the last streamed segment (or the
    // whole recording, if it never paused long enough to stream — the batch fallback, ADR-PROJ-011). The
    // text is never logged (ADR-PROJ-007); it goes from the worker's pipe into the focused window only.
    push_state(app, "working");

    let outcome = match crate::speech::finish_recording(app) {
        // `is_empty`, not `trim().is_empty()`: a dictation that is *only* a "neue Zeile" command comes
        // back as "\n" — whitespace to `trim`, but real output that must be inserted (huginn-text).
        Ok(Some(processed)) if !processed.text.is_empty() => {
            if inject_processed(&processed) {
                "done"
            } else {
                "error"
            }
        }
        // The tail was empty. If segments already inserted text this is a normal end to a full dictation
        // ("done"); only if NOTHING was ever inserted did the model truly hear nothing (ADR-PROJ-011).
        Ok(Some(_)) => {
            if streamed_any {
                "done"
            } else {
                tracing::info!("nothing was recognised");
                "error"
            }
        }
        Ok(None) => {
            tracing::debug!("no recording was open");
            ""
        }
        Err(e) => {
            // No model installed, the worker died, the microphone failed. The user is told — never
            // silence. A worker that crashed (ADR-PROJ-005) is brought back **off this thread**, so the
            // next recording works instead of failing until the app is restarted.
            tracing::error!(error = %e, "the recording could not be transcribed");
            let app_restart = app.clone();
            std::thread::spawn(move || match crate::speech::reload_model(&app_restart) {
                Ok(()) => tracing::info!("speech worker restarted after a failure"),
                Err(e) => tracing::error!(error = %e, "could not restart the speech worker"),
            });
            "error"
        }
    };

    // Let the outcome linger a moment so the user actually sees "inserted" / "not recognised", then take
    // the overlay down. A tapped key (`Ok(None)`) barely showed the overlay, so it hides at once.
    if !outcome.is_empty() {
        push_state(app, outcome);
        std::thread::sleep(std::time::Duration::from_millis(650));
    }
    if let Err(e) = hide_overlay(app) {
        tracing::error!(error = %e, "overlay failed to close");
    }
}

/// The measurement overlay (`HUGINN_SPIKE_OVERLAY_STICKY`): no focus claim, no session, no teardown.
pub(crate) fn on_measurement_overlay(app: &AppHandle) {
    if let Err(e) = show_overlay(app, None, Instant::now()) {
        tracing::error!(error = %e, "measurement overlay failed to appear");
    }
}

/// Build the overlay window: hidden, unactivatable, click-through. Returns its `HWND`.
///
/// Called **once** (from [`create_overlay`]). Everything about this window that matters is set before it
/// is ever shown, because the one thing that cannot be undone afterwards is the focus it takes simply by
/// existing.
fn build_overlay_window(app: &AppHandle) -> Result<isize> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if let Some(existing) = app.get_webview_window(OVERLAY_LABEL) {
        // Already built (a re-entry, or a settings reload). Reuse it — building a second one would take
        // the focus again for nothing.
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
            // real, and it was seen flashing at the top-left corner on startup. Its true position is set
            // every time it is shown anyway (on the monitor the user is actually typing on), so it costs
            // nothing to keep it out of sight until then.
            .position(OFFSCREEN_X, OFFSCREEN_Y)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            // Correct on Windows, a no-op on macOS (tauri#9065). It does not stop the window from taking
            // the foreground when it is created — that is measured, and is why this happens once at
            // startup rather than on every keypress (see win32::overlay).
            .focused(false)
            .visible(false)
            .build()
            .map_err(|e| AppError::Other(format!("overlay window could not be created: {e}")))?;

    let hwnd = window
        .hwnd()
        .map_err(|e| AppError::Other(format!("overlay has no HWND: {e}")))?
        .0 as isize;

    overlay::make_focus_neutral(hwnd)?;

    // Click-through is per window: the overlay ignores the cursor, the settings window does not.
    window
        .set_ignore_cursor_events(true)
        .map_err(|e| AppError::Other(format!("overlay could not be made click-through: {e}")))?;

    // It was built hidden, but Tauri may have shown it while wiring the webview; make sure.
    overlay::hide(hwnd)?;

    Ok(hwnd)
}

/// The overlay's URL, carrying the interface language in its fragment.
///
/// The overlay window holds **no IPC capability** (least privilege, ADR-CORE-011), so it cannot ask what
/// language to speak — it is told, in the one channel a window always has: its address.
fn overlay_url(app: &AppHandle) -> String {
    let language = app.state::<AppState>().settings.get().language;
    format!("overlay.html#{language}")
}

/// The overlay's `HWND`, or an error if it was never built.
fn overlay_hwnd(app: &AppHandle) -> Result<isize> {
    app.get_webview_window(OVERLAY_LABEL)
        .ok_or_else(|| AppError::Other("the overlay window does not exist".to_string()))?
        .hwnd()
        .map(|h| h.0 as isize)
        .map_err(|e| AppError::Other(format!("overlay has no HWND: {e}")))
}

/// Show the overlay — and verify, on the spot, that the focus did not move.
///
/// `target` is the window that must keep the focus. `None` means there is no focus claim to check (the
/// measurement overlay); the verdict is then skipped, because a *false* failure report is worse than
/// none.
fn show_overlay(app: &AppHandle, target: Option<&focus::FocusTarget>, t0: Instant) -> Result<()> {
    let hwnd = overlay_hwnd(app)?;

    // On the monitor the user is *typing on* — which on a multi-monitor desk is routinely not the
    // primary one. An overlay that says "listening" on the screen nobody is looking at is worse than no
    // overlay at all. Fall back to the overlay's own monitor when there is no target (the measurement
    // window).
    let anchor = target.map(|t| t.hwnd).unwrap_or(hwnd);
    let (x, y) = bottom_centre_of_monitor(app, anchor)?;

    overlay::show_without_activating(hwnd, x, y)?;
    // The window is reused; reset it to "listening" every time it appears, so a leftover "done" or
    // "error" from the previous recording is never what the user sees at the start of the next.
    push_state(app, "listening");
    let shown_ms = t0.elapsed().as_millis();

    // Measure, do not assume (ADR-CORE-004).
    let Some(target) = target else {
        tracing::info!(
            shown_ms,
            "overlay is up (measurement window, no focus claim)"
        );
        return Ok(());
    };

    let after = focus::foreground();
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
            "showing the overlay moved the focus (ADR-PROJ-004)"
        );
    }
    Ok(())
}

/// Take the overlay off screen.
///
/// **Hidden, not destroyed** — and that is a change the spike forced (ADR-PROJ-004 says "destroyed").
/// Destroying it would mean *building* it again on the next recording, and building is precisely what
/// steals the focus. A hidden window renders nothing and receives nothing; what the privacy promise is
/// about — the microphone — is unaffected. The GPU cost of the window continuing to exist is the open
/// question, and it is measured, not assumed (`scripts/project/measure-idle.mjs`).
fn hide_overlay(app: &AppHandle) -> Result<()> {
    let hwnd = overlay_hwnd(app)?;
    overlay::hide(hwnd)?;
    Ok(())
}

/// Bottom-centre of the monitor that `anchor_hwnd` sits on, in **physical** pixels — what `SetWindowPos`
/// speaks.
///
/// The scale factor still comes from Tauri's monitor list (Win32 gives DPI per monitor through a
/// different call, and Tauri already tracks it): the monitor whose bounds contain the work area we just
/// read. If it cannot be identified, the primary monitor's scale is the fallback — a 1-pixel placement
/// error on a mixed-DPI desk is survivable; putting the bar on the wrong screen is not.
fn bottom_centre_of_monitor(app: &AppHandle, anchor_hwnd: isize) -> Result<(i32, i32)> {
    let (x, y, width, height) = overlay::work_area_of_window(anchor_hwnd)?;

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
