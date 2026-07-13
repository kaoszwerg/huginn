//! The Windows half of the focus-neutral overlay (ADR-PROJ-004).
//!
//! No cross-platform window API delivers this. Tauri's `focused(false)` is documented as unsupported
//! on macOS and `focusable: false` steals focus anyway (tauri#9065, #14102, #15017); the same holds
//! one layer down in `tao`/`winit`.
//!
//! ## What the spike measured, and what it cost us
//!
//! The obvious design — create the overlay when the key goes down, destroy it on release — **cannot
//! be made focus-neutral on Windows**, and this is not an opinion:
//!
//! ```text
//! focus trace  step="after build (hidden)"  overlay_hwnd=0x1622e4  focus_hwnd=0x1622e4  huginn.exe
//! ```
//!
//! The window already owns the foreground the instant `WebviewWindowBuilder::build()` returns —
//! built with `.visible(false)` *and* `.focused(false)*, before a single pixel exists. Setting
//! `WS_EX_NOACTIVATE` afterwards is too late: the extended style governs activation by a click or by
//! `ShowWindow`, not the activation that creating the window performs.
//!
//! So the window is created **once**, made focus-neutral, and hidden. From then on a recording only
//! *shows* it (`SetWindowPos` + `SWP_NOACTIVATE`) and hides it again (`SW_HIDE`) — neither of which
//! can take the foreground. The caret stays where the user left it, which is the whole product.

use crate::error::{AppError, Result};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetForegroundWindow, SetWindowLongPtrW, SetWindowPos, ShowWindow,
    GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_HIDE,
    WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST,
};

/// Rewrite an extended window style so the window can never be activated.
///
/// * `WS_EX_NOACTIVATE` — the window does not take the foreground when shown or clicked. **This is
///   the bit the product depends on.**
/// * `WS_EX_TOOLWINDOW` — keeps it out of the taskbar and out of the Alt-Tab list.
/// * `WS_EX_TOPMOST` — it sits above the application being dictated into.
/// * `WS_EX_APPWINDOW` is **cleared**: it would force a taskbar button back and contradicts
///   `WS_EX_TOOLWINDOW`.
///
/// Pure bit arithmetic, so it is tested without a window (the OS call below is the only untested
/// line, and it can only fail on an invalid handle).
pub fn focus_neutral_ex_style(current: u32) -> u32 {
    let add = WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TOPMOST.0;
    (current | add) & !WS_EX_APPWINDOW.0
}

/// Apply [`focus_neutral_ex_style`] to a real window. Call this while it is still hidden.
pub fn make_focus_neutral(hwnd: isize) -> Result<()> {
    let hwnd = HWND(hwnd as *mut _);
    // GetWindowLongPtrW does not use SetLastError on success, so a 0 result is not an error here;
    // a window with no extended style is legal.
    let current = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    let next = focus_neutral_ex_style(current);

    let previous = unsafe { SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next as isize) };
    if previous == 0 && current != 0 {
        return Err(AppError::Other(format!(
            "SetWindowLongPtrW(GWL_EXSTYLE) failed: {}",
            std::io::Error::last_os_error()
        )));
    }
    tracing::debug!(
        ex_style_before = format!("{current:#x}"),
        ex_style_after = format!("{next:#x}"),
        "overlay made focus-neutral (WS_EX_NOACTIVATE)"
    );
    Ok(())
}

/// Show the window at `(x, y)` (physical pixels) **without** activating it.
///
/// Tauri's `window.show()` ends in `ShowWindow(SW_SHOW)`, which activates. `SetWindowPos` with
/// `SWP_NOACTIVATE | SWP_SHOWWINDOW` shows it and leaves the foreground window alone — which,
/// combined with `WS_EX_NOACTIVATE`, is what keeps the caret in the user's editor.
///
/// The position is applied in the same call: moving the window afterwards would need a second
/// `SetWindowPos`, and every extra window operation is another chance to touch the foreground.
pub fn show_without_activating(hwnd: isize, x: i32, y: i32) -> Result<()> {
    let hwnd = HWND(hwnd as *mut _);
    unsafe {
        SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            x,
            y,
            0,
            0,
            SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_NOSIZE,
        )
    }
    .map_err(|e| AppError::Other(format!("SetWindowPos(SWP_NOACTIVATE) failed: {e}")))?;
    tracing::debug!(x, y, "overlay shown with SWP_NOACTIVATE");
    Ok(())
}

/// Hide the window. `SW_HIDE` never activates anything, and it leaves the window — and its loaded
/// webview — alive, so the next recording puts it back on screen in a single call instead of
/// rebuilding it (which is what stole the focus in the first place).
pub fn hide(hwnd: isize) -> Result<()> {
    let hwnd = HWND(hwnd as *mut _);
    // ShowWindow returns the previous visibility, not a success flag: a `false` here means "it was
    // already hidden", which is not an error.
    let _ = unsafe { ShowWindow(hwnd, SW_HIDE) };
    tracing::debug!("overlay hidden");
    Ok(())
}

/// Hand the foreground back to `hwnd`.
///
/// Needed exactly once, at startup: creating the overlay's window takes the foreground even when it
/// is built hidden and unfocusable (measured — see the module docs), so whatever the user was doing
/// gets it back immediately. Windows only grants `SetForegroundWindow` to the process that currently
/// *holds* the foreground — which, at that instant, is us. That is why it works here and would not
/// work as a general "steal focus back" trick.
pub fn restore_foreground(hwnd: isize) -> Result<()> {
    let hwnd = HWND(hwnd as *mut _);
    let ok = unsafe { SetForegroundWindow(hwnd) }.as_bool();
    if !ok {
        return Err(AppError::Other(
            "SetForegroundWindow was refused — the foreground could not be handed back".to_string(),
        ));
    }
    tracing::debug!("foreground handed back to the window that had it");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_focus_neutral_bits_are_all_set() {
        let ex = focus_neutral_ex_style(0);
        assert_ne!(
            ex & WS_EX_NOACTIVATE.0,
            0,
            "WS_EX_NOACTIVATE is the whole point"
        );
        assert_ne!(
            ex & WS_EX_TOOLWINDOW.0,
            0,
            "must stay out of the taskbar/Alt-Tab"
        );
        assert_ne!(
            ex & WS_EX_TOPMOST.0,
            0,
            "must sit above the dictation target"
        );
    }

    #[test]
    fn appwindow_is_cleared_so_no_taskbar_button_returns() {
        let ex = focus_neutral_ex_style(WS_EX_APPWINDOW.0);
        assert_eq!(ex & WS_EX_APPWINDOW.0, 0, "WS_EX_APPWINDOW must be removed");
    }

    #[test]
    fn existing_unrelated_style_bits_are_preserved() {
        // Tauri sets its own bits (layered/transparent among them); we add to them, we do not
        // replace them.
        let foreign = 0x0002_0000u32; // an arbitrary bit we do not own
        let ex = focus_neutral_ex_style(foreign);
        assert_ne!(ex & foreign, 0, "a style we did not set must survive");
    }

    #[test]
    fn applying_it_twice_changes_nothing() {
        let once = focus_neutral_ex_style(0);
        assert_eq!(focus_neutral_ex_style(once), once, "must be idempotent");
    }
}
