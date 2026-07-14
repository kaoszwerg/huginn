//! Model assets: the catalogue, the verified download, and the store on disk (ADR-PROJ-006).
//!
//! **This crate is the only place in Huginn that opens a network connection.** Everything here exists
//! to keep that sentence true:
//!
//! * The catalogue is **compiled in**, never fetched. A remote manifest would let a server choose
//!   which file with which hash gets installed, and the checksum would stop being a security property.
//! * A download happens **only when the user clicks**. Never on first launch, never in the background,
//!   never "to be helpful".
//! * A file is **verified before it is used**, against the SHA-256 in the signed binary. A mismatch
//!   deletes the file and reports the failure. Never "probably fine".
//! * A model is **data**. Huginn never downloads code — no DLL, no GPU backend, no plugin. Backends
//!   ship with the app.

mod catalogue;
mod download;
mod import;
mod store;

pub use catalogue::{find, ModelInfo, DEFAULT_MODEL, MODELS};
pub use download::download_and_verify;
pub use import::import_model;
pub use store::{installed, model_path, ModelStatus};

#[derive(Debug, thiserror::Error)]
pub enum ModelError {
    #[error("unknown model: {0}")]
    Unknown(String),

    #[error("the download failed: {0}")]
    Download(String),

    /// The file arrived but is not the file we expected. It is deleted, and this is what the user
    /// sees — no "probably fine", no silent use of an unverified model.
    #[error(
        "the downloaded file is not the expected one (checksum mismatch) — it has been deleted"
    )]
    ChecksumMismatch,

    #[error("not enough disk space: {needed_mb} MB are needed, {free_mb} MB are free")]
    NotEnoughSpace { needed_mb: u64, free_mb: u64 },

    #[error("the download was cancelled")]
    Cancelled,

    #[error("file error at {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

pub type Result<T> = std::result::Result<T, ModelError>;
