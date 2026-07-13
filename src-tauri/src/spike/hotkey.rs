//! Push-to-talk hotkey: which shortcuts we accept, and why we refuse the others.
//!
//! The refusals are not taste — each one is a documented platform failure (ADR-PROJ-004):
//!
//! * **Media keys** route through a `CGEventTap` on macOS and trigger the Input-Monitoring
//!   permission prompt. A regular combination needs no permission at all, so a media key would
//!   cost the user a scary dialog for nothing.
//! * **Option alone** (and Option+Shift) is rejected by macOS Sequoia with `-9868`, an
//!   anti-keylogger measure.
//! * **`Fn`** cannot be registered *at all*: `global-hotkey` has no platform mapping for it
//!   (`platform_impl/windows/mod.rs` ends in `_ => return None`, and answers a registration with
//!   `FailedToRegister("Unknown VKCode for Fn")`; macOS behaves the same). Refusing it here means
//!   the user is told *why* instead of meeting an opaque OS error.
//!
//! Everything else is left to the OS: a shortcut we do not refuse but that the platform declines
//! still surfaces its registration error to the user — it is never swallowed (rule:logging).

use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

/// The default push-to-talk combination: hold `Ctrl+Space` to speak.
///
/// Two keys, not three: a combination you hold down while speaking has to be comfortable, and a
/// three-key chord is not. It carries `Control`, so the Option-only rule does not catch it, and it
/// is not a media key.
///
/// **It is a default, not a promise.** `Ctrl+Space` is a popular combination — an input-method
/// switcher or an editor may already own it — and a global registration that fails is exactly the
/// case this module is built to surface: the user is told, and changes it (see `set_hotkey`).
///
/// The real value lives in the user's settings; this is only what a fresh install starts with.
pub const DEFAULT_HOTKEY: &str = "Ctrl+Space";

/// Why a shortcut cannot be used for push-to-talk.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShortcutRefusal {
    /// A media/volume/launch key — routed through a `CGEventTap` on macOS (permission prompt).
    MediaKey,
    /// Option (Alt) as the only non-Shift modifier — macOS Sequoia refuses it (`-9868`).
    OptionOnly,
    /// The key has no platform keycode in `global-hotkey` (`Fn`, `FnLock`) and can never register.
    NoPlatformKeyCode,
}

impl ShortcutRefusal {
    /// A message written for the user, not for a log line (rule:overlay-and-input: a refusal is
    /// shown, never swallowed).
    pub fn reason(self) -> &'static str {
        match self {
            ShortcutRefusal::MediaKey => {
                "Media keys cannot be used: on macOS they require the Input-Monitoring permission. \
                 Pick a regular key combination."
            }
            ShortcutRefusal::OptionOnly => {
                "Option/Alt on its own (or with Shift) is rejected by macOS. \
                 Add Control or Command."
            }
            ShortcutRefusal::NoPlatformKeyCode => {
                "This key cannot be registered as a global shortcut on this platform. \
                 Pick a regular key combination."
            }
        }
    }
}

/// Validate a shortcut against the platform rules above.
///
/// Returns `Ok(())` when the combination is usable, or the reason it is refused. It does **not**
/// guarantee the OS will accept it — a `FailedToRegister`/`AlreadyRegistered` from the platform is
/// still possible and is reported separately.
pub fn validate(shortcut: &Shortcut) -> Result<(), ShortcutRefusal> {
    if is_media_key(shortcut.key) {
        return Err(ShortcutRefusal::MediaKey);
    }
    if !has_platform_keycode(shortcut.key) {
        return Err(ShortcutRefusal::NoPlatformKeyCode);
    }
    if is_option_only(shortcut.mods) {
        return Err(ShortcutRefusal::OptionOnly);
    }
    Ok(())
}

/// Keys that macOS routes through a `CGEventTap` (and Windows through the multimedia VKs).
fn is_media_key(key: Code) -> bool {
    matches!(
        key,
        Code::MediaPlayPause
            | Code::MediaPlay
            | Code::MediaPause
            | Code::MediaStop
            | Code::MediaSelect
            | Code::MediaTrackNext
            | Code::MediaTrackPrevious
            | Code::MediaFastForward
            | Code::MediaRewind
            | Code::MediaRecord
            | Code::AudioVolumeUp
            | Code::AudioVolumeDown
            | Code::AudioVolumeMute
            | Code::Eject
            | Code::LaunchMail
            | Code::LaunchApp1
            | Code::LaunchApp2
    )
}

/// `Fn`/`FnLock` are in the `Code` enum but have no platform keycode in `global-hotkey`.
///
/// This is deliberately a short deny-list, not a copy of `global-hotkey`'s mapping table:
/// duplicating that table would rot the moment the crate gains a key (ADR-CORE-005). Anything not
/// listed here is offered to the OS, and a refusal from the OS is surfaced.
fn has_platform_keycode(key: Code) -> bool {
    !matches!(key, Code::Fn | Code::FnLock)
}

/// True when Alt/Option is present and neither Control nor Command/Super is — the combination
/// macOS Sequoia refuses. Shift does not rescue it (Option+Shift is refused as well).
fn is_option_only(mods: Modifiers) -> bool {
    let has_alt = mods.contains(Modifiers::ALT);
    let rescued = mods.contains(Modifiers::CONTROL)
        || mods.contains(Modifiers::META)
        || mods.contains(Modifiers::SUPER);
    has_alt && !rescued
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn the_default_hotkey_is_itself_valid() {
        // Guards against a future edit that quietly makes our own default illegal.
        let s = Shortcut::from_str(DEFAULT_HOTKEY).expect("default hotkey must parse");
        assert_eq!(validate(&s), Ok(()));
    }

    #[test]
    fn control_alt_combination_is_accepted() {
        let s = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
        assert_eq!(validate(&s), Ok(()));
    }

    #[test]
    fn option_alone_is_refused() {
        let s = Shortcut::new(Some(Modifiers::ALT), Code::Space);
        assert_eq!(validate(&s), Err(ShortcutRefusal::OptionOnly));
    }

    #[test]
    fn option_plus_shift_is_refused_too() {
        let s = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Space);
        assert_eq!(validate(&s), Err(ShortcutRefusal::OptionOnly));
    }

    #[test]
    fn command_rescues_an_alt_combination() {
        let s = Shortcut::new(Some(Modifiers::ALT | Modifiers::META), Code::Space);
        assert_eq!(validate(&s), Ok(()));
    }

    #[test]
    fn media_keys_are_refused() {
        for key in [
            Code::MediaPlayPause,
            Code::MediaTrackNext,
            Code::AudioVolumeUp,
            Code::AudioVolumeMute,
        ] {
            let s = Shortcut::new(None, key);
            assert_eq!(validate(&s), Err(ShortcutRefusal::MediaKey), "key {key:?}");
        }
    }

    #[test]
    fn fn_key_is_refused_because_no_platform_can_register_it() {
        // global-hotkey has no VK mapping for Fn: registration would fail with an opaque
        // "Unknown VKCode for Fn". We refuse it up front, with a reason.
        let s = Shortcut::new(None, Code::Fn);
        assert_eq!(validate(&s), Err(ShortcutRefusal::NoPlatformKeyCode));
    }

    #[test]
    fn every_refusal_carries_a_reason_for_the_user() {
        for r in [
            ShortcutRefusal::MediaKey,
            ShortcutRefusal::OptionOnly,
            ShortcutRefusal::NoPlatformKeyCode,
        ] {
            assert!(!r.reason().is_empty(), "{r:?} has no reason");
        }
    }

    /// **The boundary contract** (rule:testing, ADR-CORE-005). The hotkey recorder in the frontend
    /// (`HotkeyField.toShortcutSpec`) builds these strings from the DOM's physical `KeyboardEvent.code`
    /// and hands them to `set_hotkey`. If this parser and that formatter ever disagree, the user
    /// records a combination, the app says nothing, and the key silently never fires — so both sides
    /// are pinned, and the same literals appear in `HotkeyField.test.tsx`.
    #[test]
    fn every_shortcut_the_frontend_recorder_can_produce_parses_here() {
        for spec in [
            "Ctrl+Space",          // the default
            "Ctrl+Shift+KeyJ",     // letters arrive as their physical code
            "Ctrl+Shift+Alt+KeyJ", // the modifier order the recorder emits
            "Ctrl+KeyZ",
            "Alt+Digit1",     // digits, likewise
            "F9",             // a single key, no modifier
            "Ctrl+Semicolon", // punctuation by code, not by character
            "Super+Space",    // the recorder writes Meta as "Super"
        ] {
            let parsed = Shortcut::from_str(spec);
            assert!(
                parsed.is_ok(),
                "the frontend can record {spec:?}, but Rust cannot parse it"
            );
        }
    }
}
