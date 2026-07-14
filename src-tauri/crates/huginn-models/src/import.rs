//! Importing a model from disk (ADR-PROJ-006).
//!
//! A user may bring their own whisper model. It is **not verifiable** — there is no compiled-in hash
//! for a file we have never seen — so the UI must say so, and it is **never** labelled "verified". What
//! makes it safe to allow at all is the process boundary: the file is parsed in the deprivileged worker,
//! never in the process that holds the microphone and the keyboard (ADR-PROJ-005,
//! rule:speech-and-privacy). This module only copies bytes; it never parses them.

use crate::store::model_path;
use crate::{ModelError, Result};
use huginn_core::jobs::{CancelToken, JobKind, JobRegistry, Progress};
use std::io::{Read, Write};
use std::path::Path;

/// Marks a model as user-imported, so the store tells it apart from the compiled-in catalogue on disk.
pub const IMPORTED_PREFIX: &str = "imported-";

/// Reject anything larger than this. A whisper model tops out at a few GB; an 8 GB+ "model" is a mistake
/// or an attempt to fill the user's disk, and copying it silently would be neither honest nor safe.
const MAX_IMPORT_BYTES: u64 = 8 * 1024 * 1024 * 1024;

/// Copy in the same-size chunks the download uses: big enough that the syscalls are free, small enough
/// that a cancel is noticed within milliseconds.
const CHUNK: usize = 64 * 1024;

/// Import a model file the user chose into the app's store, reported as a Job. Returns the new id.
///
/// **Unverifiable by design** (no expected hash) and never marked verified. Atomic: the bytes land in a
/// `.part` file and are renamed into place only once the copy finishes, so an interrupted import can
/// never leave a half-model that looks installed (mirrors the download, ADR-PROJ-006).
pub fn import_model(models_dir: &Path, source: &Path, jobs: &JobRegistry) -> Result<String> {
    let meta = std::fs::metadata(source).map_err(|e| ModelError::Io {
        path: source.display().to_string(),
        source: e,
    })?;
    if !meta.is_file() {
        return Err(ModelError::Download(format!(
            "{} is not a file",
            source.display()
        )));
    }
    let size = meta.len();
    if size == 0 {
        return Err(ModelError::Download("the chosen file is empty".into()));
    }
    if size > MAX_IMPORT_BYTES {
        return Err(ModelError::Download(format!(
            "the file is {} GB — too large to be a speech model",
            size / (1024 * 1024 * 1024)
        )));
    }

    let id = imported_id(source);
    let label = display_label(&id);

    let (job, cancel) = jobs.start(
        JobKind::ModelDownload,
        format!("Importing {label}"),
        Progress::Determinate {
            done: 0,
            total: size,
        },
        true,
    );

    match copy_in(models_dir, source, &id, size, jobs, job, &cancel) {
        Ok(()) => {
            jobs.succeed(job);
            tracing::info!(id = %id, bytes = size, "a model was imported from disk (unverified)");
            Ok(id)
        }
        Err(ModelError::Cancelled) => Err(ModelError::Cancelled),
        Err(e) => {
            jobs.fail(job, e.to_string());
            Err(e)
        }
    }
}

fn copy_in(
    models_dir: &Path,
    source: &Path,
    id: &str,
    total: u64,
    jobs: &JobRegistry,
    job: u64,
    cancel: &CancelToken,
) -> Result<()> {
    std::fs::create_dir_all(models_dir).map_err(|e| ModelError::Io {
        path: models_dir.display().to_string(),
        source: e,
    })?;

    let target = model_path(models_dir, id);
    let part = target.with_extension("part");

    let mut input = std::fs::File::open(source).map_err(|e| ModelError::Io {
        path: source.display().to_string(),
        source: e,
    })?;
    let mut output = std::fs::File::create(&part).map_err(|e| ModelError::Io {
        path: part.display().to_string(),
        source: e,
    })?;

    let mut buffer = vec![0u8; CHUNK];
    let mut done: u64 = 0;
    loop {
        if cancel.is_cancelled() {
            drop(output);
            let _ = std::fs::remove_file(&part);
            return Err(ModelError::Cancelled);
        }
        let read = input.read(&mut buffer).map_err(|e| ModelError::Io {
            path: source.display().to_string(),
            source: e,
        })?;
        if read == 0 {
            break;
        }
        output
            .write_all(&buffer[..read])
            .map_err(|e| ModelError::Io {
                path: part.display().to_string(),
                source: e,
            })?;
        done += read as u64;
        jobs.progress(job, Progress::Determinate { done, total });
    }

    output.flush().map_err(|e| ModelError::Io {
        path: part.display().to_string(),
        source: e,
    })?;
    drop(output);

    // Only now does it become the model — the atomic swap the download uses, for the same reason.
    std::fs::rename(&part, &target).map_err(|e| ModelError::Io {
        path: target.display().to_string(),
        source: e,
    })?;
    Ok(())
}

/// A safe, stable id for an imported file: the prefix plus the filename stem, reduced to a plain
/// filename component — no path separators, no `..`, nothing that could escape the models directory.
pub fn imported_id(source: &Path) -> String {
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("model");
    let clean: String = stem
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = clean.trim_matches('-');
    let base = if trimmed.is_empty() { "model" } else { trimmed };
    format!("{IMPORTED_PREFIX}{base}")
}

/// The human label for an imported model id: the id without the internal prefix.
pub fn display_label(id: &str) -> String {
    id.strip_prefix(IMPORTED_PREFIX).unwrap_or(id).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn an_imported_id_is_prefixed_and_safe() {
        let id = imported_id(Path::new("/home/me/My Model v2.bin"));
        assert!(id.starts_with(IMPORTED_PREFIX));
        // No spaces, no separators — a plain filename component.
        assert!(!id.contains(' ') && !id.contains('/') && !id.contains('\\'));
        assert_eq!(id, "imported-My-Model-v2");
    }

    #[test]
    fn a_traversal_attempt_cannot_escape_the_prefix() {
        let id = imported_id(Path::new("../../etc/passwd"));
        // `file_stem` already strips the directory; the sanitiser removes the rest.
        assert!(id.starts_with(IMPORTED_PREFIX));
        assert!(!id.contains('/') && !id.contains("..") && !id.contains('\\'));
    }

    #[test]
    fn the_label_drops_the_internal_prefix() {
        assert_eq!(display_label("imported-my-model"), "my-model");
        assert_eq!(display_label("ggml-base"), "ggml-base");
    }
}
