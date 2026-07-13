//! Who owns the keyboard focus right now — the measurement the whole spike turns on.
//!
//! Huginn types into the application the user was working in. If the overlay activates Huginn when
//! it appears, that target is gone (ADR-PROJ-004). So we do not *assert* focus-neutrality, we
//! observe it: the foreground window is read before the overlay is created and again after it is
//! on screen, and the two are compared.
//!
//! **What is recorded, and what is not.** The window handle and the target's executable name
//! (`notepad.exe`) — enough to prove the focus stayed put. Never the window title: a title carries
//! the user's document name, and that is content, not diagnostics (ADR-PROJ-007, rule:privacy).

use windows::Win32::Foundation::{CloseHandle, HWND, MAX_PATH};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

/// The window that currently holds the keyboard focus.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FocusTarget {
    /// Raw `HWND`, kept as `isize` so it stays `Send` and comparable.
    pub hwnd: isize,
    /// The owning process's executable name (`notepad.exe`), or `"<unknown>"` if it cannot be read
    /// (a process we may not open — an elevated one, for instance).
    pub process: String,
}

impl FocusTarget {
    /// True when both refer to the same window — the proof that the overlay took no focus.
    pub fn is_same_window(&self, other: &FocusTarget) -> bool {
        self.hwnd == other.hwnd
    }
}

/// Read the current foreground window, or `None` when there is none (the desktop is idle, or a
/// screen-locked session).
pub fn foreground() -> Option<FocusTarget> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() {
        return None;
    }
    Some(FocusTarget {
        hwnd: hwnd.0 as isize,
        process: process_name(hwnd).unwrap_or_else(|| "<unknown>".to_string()),
    })
}

/// The executable name behind a window — the file name only, never the full path (which can carry
/// a user name).
fn process_name(hwnd: HWND) -> Option<String> {
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 {
        return None;
    }

    // SAFETY: the handle is closed on every path below before the function returns.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;

    let mut buf = [0u16; MAX_PATH as usize];
    let mut len = buf.len() as u32;
    let read = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
    };
    let _ = unsafe { CloseHandle(handle) };
    read.ok()?;

    let full = String::from_utf16_lossy(&buf[..len as usize]);
    Some(
        full.rsplit(['\\', '/'])
            .next()
            .unwrap_or(&full)
            .to_ascii_lowercase(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_window_compares_the_handle_not_the_process() {
        let a = FocusTarget {
            hwnd: 42,
            process: "notepad.exe".into(),
        };
        let b = FocusTarget {
            hwnd: 42,
            process: "<unknown>".into(),
        };
        let c = FocusTarget {
            hwnd: 43,
            process: "notepad.exe".into(),
        };
        assert!(a.is_same_window(&b), "same handle is the same window");
        assert!(
            !a.is_same_window(&c),
            "a different handle is a different window"
        );
    }

    #[test]
    fn foreground_reads_a_real_window_or_none_but_never_panics() {
        // On a CI agent there may be no foreground window at all; both outcomes are valid, a panic
        // is not. When there is one, it must carry a usable handle.
        if let Some(t) = foreground() {
            assert_ne!(t.hwnd, 0, "a foreground window must have a handle");
            assert!(!t.process.is_empty(), "process name must never be empty");
        }
    }
}
