//! Reading the clipboard on Windows, for the `{clipboard}` macro placeholder (ADR-PROJ-010).
//!
//! Read only, and only when a macro that uses `{clipboard}` actually fires (see
//! `speech::build_context`). The contents are the user's own, going into the user's own document; they
//! are **never logged** (ADR-PROJ-007) and never leave the device.

use crate::error::{AppError, Result};
use windows::Win32::Foundation::{HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
use windows::Win32::System::Ole::CF_UNICODETEXT;

/// The clipboard's text, or an empty string if it holds no Unicode text.
pub fn read_text() -> Result<String> {
    unsafe {
        OpenClipboard(None)
            .map_err(|e| AppError::Other(format!("cannot open the clipboard: {e}")))?;
        // Read inside a scope, then always close — even on an early return.
        let result = read_unicode_text();
        let _ = CloseClipboard();
        result
    }
}

/// # Safety
/// Must be called between `OpenClipboard` and `CloseClipboard`.
unsafe fn read_unicode_text() -> Result<String> {
    let handle: HANDLE = match GetClipboardData(CF_UNICODETEXT.0 as u32) {
        Ok(h) if !h.is_invalid() => h,
        // No Unicode text on the clipboard is not an error — the macro just gets an empty value.
        _ => return Ok(String::new()),
    };

    let hglobal = HGLOBAL(handle.0);
    let ptr = GlobalLock(hglobal) as *const u16;
    if ptr.is_null() {
        return Ok(String::new());
    }

    // The clipboard's CF_UNICODETEXT is a null-terminated UTF-16 string.
    let mut len = 0usize;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    let text = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));

    let _ = GlobalUnlock(hglobal);
    Ok(text)
}
