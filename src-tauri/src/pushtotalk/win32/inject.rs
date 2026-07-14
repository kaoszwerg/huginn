//! Text injection on Windows via `SendInput` (ADR-PROJ-004).
//!
//! Synthesised keystrokes are sent as **Unicode** (`KEYEVENTF_UNICODE`), not as virtual keys: a VK
//! sequence depends on the target's keyboard layout, so "ü" typed into a US-layout process would
//! arrive as something else. A Unicode injection carries the character itself and is
//! layout-independent.
//!
//! `SendInput` delivers to whatever window has the keyboard focus — which is exactly why the
//! overlay must not take it (`overlay::ExStyle`). The failure of an insertion is reported, never
//! swallowed: text that vanishes silently is the worst possible bug in a dictation tool.

use crate::error::{AppError, Result};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_LEFT,
};

/// Build the `INPUT` sequence for `text`: one key-down + one key-up per UTF-16 code unit.
///
/// A character outside the BMP (an emoji) is two code units — a surrogate pair — and Windows wants
/// both halves as separate `INPUT`s, in order. `str::encode_utf16` produces exactly that, so the
/// pair falls out of the encoding rather than out of a special case.
pub fn utf16_inputs(text: &str) -> Vec<INPUT> {
    let mut inputs = Vec::with_capacity(text.encode_utf16().count() * 2);
    for unit in text.encode_utf16() {
        inputs.push(key_event(unit, false));
        inputs.push(key_event(unit, true));
    }
    inputs
}

fn key_event(code_unit: u16, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: windows::Win32::UI::Input::KeyboardAndMouse::INPUT_0 {
            ki: KEYBDINPUT {
                wVk: Default::default(),
                wScan: code_unit,
                dwFlags: if up {
                    KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
                } else {
                    KEYEVENTF_UNICODE
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

/// Type `text` into whatever window currently holds the keyboard focus.
///
/// Returns the number of `INPUT` events accepted by the OS. `SendInput` returning fewer events
/// than it was given means the input stream was blocked (UIPI: an elevated target refuses input
/// from a non-elevated process) — that is an error, not a partial success, and it is reported.
pub fn send_text(text: &str) -> Result<usize> {
    if text.is_empty() {
        return Ok(0);
    }
    let inputs = utf16_inputs(text);
    // Never log `text` itself: it is the user's dictated content (ADR-PROJ-007). Counts only.
    tracing::debug!(
        events = inputs.len(),
        chars = text.chars().count(),
        "SendInput"
    );

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) } as usize;
    if sent != inputs.len() {
        let os = std::io::Error::last_os_error();
        return Err(AppError::Other(format!(
            "SendInput injected {sent} of {} events ({os}) — the target likely refuses synthetic \
             input (an elevated window blocks it via UIPI)",
            inputs.len()
        )));
    }
    Ok(sent)
}

/// Move the caret left by `count` characters — synthesised Left-arrow presses, so a macro's `{cursor}`
/// placeholder can leave the caret inside the inserted text (ADR-PROJ-010). Same capability and trust as
/// [`send_text`] (ADR-PROJ-004): synthetic input into the focused window.
pub fn move_caret_left(count: usize) -> Result<()> {
    if count == 0 {
        return Ok(());
    }
    let mut inputs = Vec::with_capacity(count * 2);
    for _ in 0..count {
        inputs.push(vk_event(VK_LEFT, false));
        inputs.push(vk_event(VK_LEFT, true));
    }

    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) } as usize;
    if sent != inputs.len() {
        let os = std::io::Error::last_os_error();
        return Err(AppError::Other(format!(
            "SendInput moved the caret {sent} of {} steps ({os})",
            inputs.len()
        )));
    }
    Ok(())
}

/// A virtual-key event (for keys that are not characters, like the arrows). A key-down carries no flag.
fn vk_event(vk: VIRTUAL_KEY, up: bool) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: if up {
                    KEYEVENTF_KEYUP
                } else {
                    KEYBD_EVENT_FLAGS(0)
                },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan_codes(inputs: &[INPUT]) -> Vec<u16> {
        inputs
            .iter()
            .map(|i| unsafe { i.Anonymous.ki.wScan })
            .collect()
    }

    fn flags(inputs: &[INPUT]) -> Vec<u32> {
        inputs
            .iter()
            .map(|i| unsafe { i.Anonymous.ki.dwFlags.0 })
            .collect()
    }

    #[test]
    fn each_character_becomes_a_key_down_and_a_key_up() {
        let inputs = utf16_inputs("ab");
        assert_eq!(inputs.len(), 4, "2 chars -> 2 down + 2 up");
        assert_eq!(
            scan_codes(&inputs),
            vec![b'a' as u16, b'a' as u16, b'b' as u16, b'b' as u16]
        );

        let down = KEYEVENTF_UNICODE.0;
        let up = (KEYEVENTF_UNICODE | KEYEVENTF_KEYUP).0;
        assert_eq!(flags(&inputs), vec![down, up, down, up]);
    }

    #[test]
    fn every_event_is_a_unicode_keyboard_event_with_no_virtual_key() {
        // A VK would be layout-dependent; the whole point is that it is not.
        let inputs = utf16_inputs("ü");
        for i in &inputs {
            assert_eq!(i.r#type, INPUT_KEYBOARD);
            assert_eq!(unsafe { i.Anonymous.ki.wVk.0 }, 0, "wVk must stay empty");
            assert!(
                unsafe { i.Anonymous.ki.dwFlags }.contains(KEYEVENTF_UNICODE),
                "KEYEVENTF_UNICODE must be set"
            );
        }
    }

    #[test]
    fn german_umlauts_survive_as_their_own_code_unit() {
        let inputs = utf16_inputs("ü");
        assert_eq!(inputs.len(), 2);
        assert_eq!(scan_codes(&inputs)[0], 0x00FC, "ü is U+00FC");
    }

    #[test]
    fn a_surrogate_pair_is_sent_as_two_code_units_in_order() {
        // U+1F926 (🤦) = surrogate pair D83E DD26. Windows wants both halves, in order.
        let inputs = utf16_inputs("🤦");
        assert_eq!(inputs.len(), 4, "1 char = 2 code units = 4 events");
        assert_eq!(scan_codes(&inputs), vec![0xD83E, 0xD83E, 0xDD26, 0xDD26]);
    }

    #[test]
    fn a_newline_is_carried_as_a_code_unit_too() {
        let inputs = utf16_inputs("\n");
        assert_eq!(scan_codes(&inputs), vec![0x000A, 0x000A]);
    }

    #[test]
    fn empty_text_produces_no_events_and_sends_nothing() {
        assert!(utf16_inputs("").is_empty());
        assert_eq!(send_text("").expect("empty is a no-op"), 0);
    }
}
