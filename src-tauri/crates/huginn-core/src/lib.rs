//! Huginn's domain core: the things every other crate needs and none of them owns.
//!
//! Today that is the **Job registry** (ADR-PROJ-008) — the contract that nothing slow happens
//! invisibly. Errors, the state machine and the settings types join it as they are built.

pub mod jobs;

pub use jobs::{Job, JobKind, JobRegistry, JobState, Progress};
