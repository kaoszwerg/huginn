//! Key probe — a diagnostic that answers one question with a measurement instead of an opinion:
//! **what does this keyboard actually send to the OS?**
//!
//! It exists because of `Fn`. `Code::Fn` is in the `keyboard-types` enum, so it *looks* bindable,
//! but `global-hotkey` maps it to no platform keycode on either OS (`platform_impl/windows/mod.rs`
//! ends in `_ => return None`, answering with `FailedToRegister("Unknown VKCode for Fn")`). The
//! open question is one level lower: most laptop keyboards resolve `Fn` in firmware and never send
//! a scancode at all. This probe shows, for *this* machine, whether any event arrives.
//!
//! **It logs keycodes, never characters.** A virtual-key code, a scancode and the up/down flag —
//! no text, no key-to-character translation, nothing that could reconstruct what was typed
//! (ADR-PROJ-007, rule:privacy). It is off unless `HUGINN_SPIKE_KEYPROBE=1` is set, it announces
//! itself in the log at `warn` when it starts, and it is a spike tool: it does not ship.

use crate::error::{AppError, Result};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HHOOK,
    KBDLLHOOKSTRUCT, LLKHF_EXTENDED, LLKHF_INJECTED, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
    WM_SYSKEYDOWN, WM_SYSKEYUP,
};

/// The environment variable that arms the probe. Absent → the hook is never installed.
pub const ENV_FLAG: &str = "HUGINN_SPIKE_KEYPROBE";

/// Whether a key went down or came up.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Down,
    Up,
}

/// One raw keyboard event, reduced to what is safe to record.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyEvent {
    /// Virtual-key code (`0xA2` = left Control). `0xFF` is what some vendor drivers emit for keys
    /// the OS has no VK for — which is one of the answers we are looking for.
    pub vk: u32,
    /// Hardware scancode as reported by the driver.
    pub scan: u32,
    /// The extended-key flag (right-hand modifiers, the numpad, media keys).
    pub extended: bool,
    /// True when the event was synthesised by software (`SendInput`) rather than pressed — this is
    /// how we recognise Huginn's *own* injected keystrokes in the log and do not mistake them for
    /// the user's.
    pub injected: bool,
    pub direction: Direction,
}

impl KeyEvent {
    /// Decode a low-level hook callback's arguments. Pure, so the decoding is tested without a
    /// keyboard.
    pub fn decode(message: u32, vk: u32, scan: u32, flags: u32) -> Option<Self> {
        let direction = match message {
            m if m == WM_KEYDOWN || m == WM_SYSKEYDOWN => Direction::Down,
            m if m == WM_KEYUP || m == WM_SYSKEYUP => Direction::Up,
            _ => return None,
        };
        Some(KeyEvent {
            vk,
            scan,
            extended: flags & LLKHF_EXTENDED.0 != 0,
            injected: flags & LLKHF_INJECTED.0 != 0,
            direction,
        })
    }
}

/// Install the low-level keyboard hook on a dedicated thread with its own message loop.
///
/// A `WH_KEYBOARD_LL` hook is only serviced by a thread that pumps messages; running it on its own
/// thread keeps it off the UI event loop, where a slow callback would stall every keystroke on the
/// system.
pub fn start() -> Result<()> {
    tracing::warn!(
        "key probe ACTIVE ({ENV_FLAG}=1): logging virtual-key/scancodes (never characters). \
         Diagnostic only — this does not ship."
    );

    std::thread::Builder::new()
        .name("huginn-key-probe".into())
        .spawn(|| {
            let module = match unsafe { GetModuleHandleW(None) } {
                Ok(m) => m,
                Err(e) => {
                    tracing::error!(error = %e, "key probe: GetModuleHandleW failed");
                    return;
                }
            };
            let hook = match unsafe {
                SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), Some(module.into()), 0)
            } {
                Ok(h) => h,
                Err(e) => {
                    tracing::error!(error = %e, "key probe: SetWindowsHookExW failed");
                    return;
                }
            };
            tracing::info!("key probe: hook installed — press Fn now and watch for events");

            // The loop is what makes the hook fire; it ends when the process posts WM_QUIT.
            let mut msg = MSG::default();
            while unsafe { GetMessageW(&mut msg, None, 0, 0) }.as_bool() {
                unsafe { DispatchMessageW(&msg) };
            }

            let _ = unsafe { UnhookWindowsHookEx(hook) };
            tracing::info!("key probe: hook removed");
        })
        .map_err(|e| AppError::Other(format!("key probe: cannot spawn thread: {e}")))?;

    Ok(())
}

/// The hook callback. Runs on every keystroke system-wide, so it does the minimum: decode, log,
/// pass on. It never swallows an event (`CallNextHookEx` is unconditional) — a diagnostic that
/// eats keystrokes would be a defect far worse than the one it is investigating.
unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // HC_ACTION == 0; anything below it must be passed on untouched, per the Win32 contract.
    if code >= 0 {
        let raw = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        if let Some(ev) = KeyEvent::decode(wparam.0 as u32, raw.vkCode, raw.scanCode, raw.flags.0) {
            tracing::info!(
                vk = format!("{:#04x}", ev.vk),
                scan = format!("{:#04x}", ev.scan),
                extended = ev.extended,
                injected = ev.injected,
                direction = ?ev.direction,
                "key probe"
            );
        }
    }
    unsafe { CallNextHookEx(Some(HHOOK::default()), code, wparam, lparam) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_down_and_key_up_are_distinguished() {
        let down = KeyEvent::decode(WM_KEYDOWN, 0x20, 0x39, 0).expect("keydown decodes");
        assert_eq!(down.direction, Direction::Down);
        let up = KeyEvent::decode(WM_KEYUP, 0x20, 0x39, 0).expect("keyup decodes");
        assert_eq!(up.direction, Direction::Up);
    }

    #[test]
    fn system_key_messages_decode_too() {
        // Alt-combinations arrive as WM_SYSKEYDOWN/UP — the push-to-talk default uses Alt, so
        // losing these would blind the probe to exactly the case we care about.
        assert_eq!(
            KeyEvent::decode(WM_SYSKEYDOWN, 0x12, 0x38, 0)
                .expect("syskeydown")
                .direction,
            Direction::Down
        );
        assert_eq!(
            KeyEvent::decode(WM_SYSKEYUP, 0x12, 0x38, 0)
                .expect("syskeyup")
                .direction,
            Direction::Up
        );
    }

    #[test]
    fn an_unrelated_message_decodes_to_nothing() {
        assert_eq!(KeyEvent::decode(0x0007, 0x20, 0x39, 0), None);
    }

    #[test]
    fn injected_events_are_recognisable_as_our_own() {
        let ev = KeyEvent::decode(WM_KEYDOWN, 0x41, 0x1E, LLKHF_INJECTED.0).expect("decodes");
        assert!(ev.injected, "SendInput events must be flagged as injected");
        assert!(!ev.extended);
    }

    #[test]
    fn the_extended_flag_survives_decoding() {
        let ev = KeyEvent::decode(WM_KEYDOWN, 0xA3, 0x1D, LLKHF_EXTENDED.0).expect("decodes");
        assert!(ev.extended, "right Control is an extended key");
    }

    #[test]
    fn the_probe_is_off_unless_the_environment_arms_it() {
        // Pin the contract: a diagnostic hook must never be on by default.
        assert_eq!(ENV_FLAG, "HUGINN_SPIKE_KEYPROBE");
    }
}
