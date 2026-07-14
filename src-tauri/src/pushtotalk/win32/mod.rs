//! The Windows platform layer for push-to-talk: the code that no cross-platform API provides
//! (ADR-PROJ-004). The low-level pieces are one module each; [`session`] is the Windows session driver
//! that composes them (build the overlay, show it focus-neutrally, inject the text, drive the meter).
//!
//! The macOS counterparts (a non-activating `NSPanel`, `CGEvent` injection) are **not written here and
//! not guessed at** — they are built and measured on the Mac (PLAN.md phase 1b), because a
//! `#[cfg(target_os = "macos")]` branch nobody has compiled is not a stub, it is fiction. The
//! cross-platform parent (`pushtotalk`) dispatches to whichever platform session is compiled.

pub mod clipboard;
pub mod focus;
pub mod inject;
pub mod overlay;
pub mod probe;
pub mod session;
