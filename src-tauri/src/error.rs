//! Crate-wide error type. Serialisable so it can cross the Tauri IPC boundary (ADR-APP-001).
use serde::Serialize;

/// All recoverable errors in the backend. Never `unwrap()` on these in production paths (ADR-CORE-002).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// A filesystem/IO failure, tagged with the path that triggered it.
    #[error("io error at {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },

    /// JSON (de)serialisation failure — e.g. a corrupt settings document.
    #[error("json parse error: {0}")]
    Json(#[from] serde_json::Error),

    /// Catch-all for other recoverable failures, carrying a human-readable message.
    #[error("{0}")]
    Other(String),
}

impl AppError {
    /// Helper to attach a path to an IO error.
    pub fn io(path: impl Into<String>, source: std::io::Error) -> Self {
        AppError::Io {
            path: path.into(),
            source,
        }
    }
}

/// Serialise to a plain string for the frontend (no internal details leak structurally).
///
/// This is also the **single chokepoint** for every error that ever crosses the IPC boundary, so
/// we log here as well — that way no `#[tauri::command]` can silently swallow a failure: even if
/// the call site forgets a `tracing::error!`, the error still surfaces in the rolling log file and
/// the live Logs view before the frontend receives it (rule:logging / ADR-APP-025).
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        let msg = self.to_string();
        tracing::error!(error = %msg, "command returned error");
        serializer.serialize_str(&msg)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_error_carries_the_path() {
        let e = AppError::io(
            "C:/tmp/settings.json",
            std::io::Error::new(std::io::ErrorKind::NotFound, "missing"),
        );
        let s = e.to_string();
        assert!(s.contains("C:/tmp/settings.json"), "got: {s}");
        assert!(s.contains("missing"), "got: {s}");
    }

    #[test]
    fn other_error_renders_verbatim() {
        assert_eq!(AppError::Other("boom".into()).to_string(), "boom");
    }
}
