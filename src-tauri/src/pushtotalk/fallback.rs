//! The non-Windows placeholder for the push-to-talk session (PLAN.md phase 1b).
//!
//! The hotkey itself works on every platform (it goes through `tauri-plugin-global-shortcut`), so the
//! event loop still runs and still calls these — they just have nothing to drive yet. The real overlay
//! and text injection are **written and measured on the Mac**, never guessed at from Windows: a
//! `#[cfg(target_os = "macos")]` branch nobody has compiled is not a stub, it is fiction (ADR-CORE-004).
//! When the macOS implementation lands it replaces this module for that target.

use crate::pushtotalk::Session;
use std::time::Instant;
use tauri::AppHandle;

/// No overlay to build yet on this platform. Kept so the cross-platform event loop compiles and runs
/// everywhere — the Windows build has its own, and macOS will (phase 1b).
pub(crate) fn create_overlay(_app: &AppHandle) {
    tracing::debug!("no recording overlay on this platform yet (PLAN.md phase 1b)");
}

pub(crate) fn on_pressed(_app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    if session.is_some() {
        return;
    }
    *session = Some(Session { started: at });
    tracing::warn!(
        "push-to-talk pressed — the overlay and text injection are Windows-only so far; the macOS half \
         is written and measured on the Mac (PLAN.md phase 1b)"
    );
}

pub(crate) fn on_released(_app: &AppHandle, session: &mut Option<Session>, at: Instant) {
    let Some(s) = session.take() else { return };
    tracing::warn!(
        hold_ms = at.duration_since(s.started).as_millis(),
        "push-to-talk released — nothing to insert on this platform yet (PLAN.md phase 1b)"
    );
}

pub(crate) fn on_measurement_overlay(_app: &AppHandle) {
    tracing::warn!("the measurement overlay is Windows-only so far (PLAN.md phase 1b)");
}
