//! The Windows half of the phase-1a spike (PLAN.md): the platform code that no cross-platform API
//! provides. Each module is one of the four things the spike must prove.
//!
//! The macOS counterparts (a non-activating `NSPanel`, `CGEvent` injection) are **not written
//! here and not guessed at** — they are built and measured on the Mac (PLAN.md phase 1b), because
//! a `#[cfg(target_os = "macos")]` branch nobody has compiled is not a stub, it is fiction.

pub mod focus;
pub mod inject;
pub mod overlay;
pub mod probe;
