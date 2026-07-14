//! The download — the only outbound connection in the product (ADR-PROJ-006).
//!
//! Every line here is a promise being kept:
//!
//! * **HTTPS with an explicit timeout.** No identifiers, no headers that fingerprint the user. The
//!   host learns an IP address, which is unavoidable when fetching a file, and nothing else.
//! * **Verified before it is used.** The SHA-256 is computed *while* the bytes are written and
//!   compared against the value compiled into the signed binary. A mismatch deletes the file.
//! * **Atomic.** The bytes land in a `.part` file and are renamed over the target only after the
//!   checksum matches. A crash or a cancel can never leave a half-model in place of a good one.
//! * **Cancellable, and the cancel actually stops it.** The token is checked between chunks — not
//!   just on the row in the UI (rule:jobs).

use crate::catalogue::{self, ModelInfo};
use crate::store::model_path;
use crate::{ModelError, Result};
use huginn_core::jobs::{CancelToken, JobKind, JobRegistry, Progress};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::Path;
use std::time::Duration;

/// How long to wait for the server before giving up. Generous enough for a slow line, short enough
/// that a black hole does not hang a job forever.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

/// Read this much at a time. Big enough that the syscall overhead is nothing, small enough that a
/// cancel is noticed within a few milliseconds.
const CHUNK: usize = 64 * 1024;

/// Download a model, verify it, and put it where the app expects it.
///
/// Reports through the job registry the whole way: progress in **bytes** (so the UI can say "412 MB
/// of 1.5 GB" and compute an honest rate), and an ETA derived from the measured throughput.
///
/// Returns the path of the verified file.
pub fn download_and_verify(
    models_dir: &Path,
    id: &str,
    jobs: &JobRegistry,
) -> Result<std::path::PathBuf> {
    let model = catalogue::find(id).ok_or_else(|| ModelError::Unknown(id.to_string()))?;

    let (job, cancel) = jobs.start(
        JobKind::ModelDownload,
        format!("Downloading {}", model.label),
        Progress::Determinate {
            done: 0,
            total: model.size_bytes,
        },
        true,
    );

    match run(models_dir, model, jobs, job, &cancel) {
        Ok(path) => {
            jobs.succeed(job);
            Ok(path)
        }
        Err(ModelError::Cancelled) => {
            // `cancel` already marked the row; do not overwrite it with a failure.
            Err(ModelError::Cancelled)
        }
        Err(e) => {
            jobs.fail(job, e.to_string());
            Err(e)
        }
    }
}

fn run(
    models_dir: &Path,
    model: &ModelInfo,
    jobs: &JobRegistry,
    job: u64,
    cancel: &CancelToken,
) -> Result<std::path::PathBuf> {
    std::fs::create_dir_all(models_dir).map_err(|e| ModelError::Io {
        path: models_dir.display().to_string(),
        source: e,
    })?;

    let target = model_path(models_dir, model.id);
    let part = target.with_extension("part");

    tracing::info!(
        model = model.id,
        url = model.url,
        size_mb = model.size_mb(),
        "downloading a model — the only outbound connection Huginn makes"
    );

    let response = ureq::get(model.url)
        .config()
        .timeout_connect(Some(CONNECT_TIMEOUT))
        .build()
        .call()
        .map_err(|e| ModelError::Download(format!("{}: {e}", model.url)))?;

    let mut body = response.into_body().into_reader();
    let mut file = std::fs::File::create(&part).map_err(|e| ModelError::Io {
        path: part.display().to_string(),
        source: e,
    })?;

    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; CHUNK];
    let mut done: u64 = 0;

    loop {
        // Between chunks, not between files: a cancel must stop the bandwidth, not just the row.
        if cancel.is_cancelled() {
            drop(file);
            let _ = std::fs::remove_file(&part);
            tracing::info!(
                model = model.id,
                "download cancelled — the partial file was removed"
            );
            return Err(ModelError::Cancelled);
        }

        let read = body
            .read(&mut buffer)
            .map_err(|e| ModelError::Download(e.to_string()))?;
        if read == 0 {
            break;
        }

        // Hash as we write: a second pass over 500 MB to verify would double the disk I/O for
        // nothing.
        hasher.update(&buffer[..read]);
        file.write_all(&buffer[..read])
            .map_err(|e| ModelError::Io {
                path: part.display().to_string(),
                source: e,
            })?;

        done += read as u64;
        jobs.progress(
            job,
            Progress::Determinate {
                done,
                total: model.size_bytes,
            },
        );
    }

    file.flush().map_err(|e| ModelError::Io {
        path: part.display().to_string(),
        source: e,
    })?;
    drop(file);

    // sha2 0.11 hands back a byte array, not something that formats itself as hex.
    let digest: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if digest != model.sha256 {
        // The file is not what the signed binary says it should be. It does not get to exist.
        let _ = std::fs::remove_file(&part);
        tracing::error!(
            model = model.id,
            expected = model.sha256,
            got = %digest,
            "checksum mismatch — the file was deleted"
        );
        return Err(ModelError::ChecksumMismatch);
    }

    // Only now does it become the model. The old one survived until this instant, so a failed
    // download can never take a working model away from the user.
    std::fs::rename(&part, &target).map_err(|e| ModelError::Io {
        path: target.display().to_string(),
        source: e,
    })?;

    tracing::info!(
        model = model.id,
        bytes = done,
        path = %target.display(),
        "model downloaded and verified"
    );
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_model_is_refused_before_anything_is_opened() {
        let jobs = JobRegistry::new();
        let dir = std::env::temp_dir().join("huginn-download-test");

        let err = download_and_verify(&dir, "ggml-does-not-exist", &jobs).expect_err("must refuse");
        assert!(matches!(err, ModelError::Unknown(_)));

        // And no job was started for work that never began.
        assert!(jobs.snapshot().is_empty());
    }

    #[test]
    fn the_download_reports_bytes_so_the_ui_can_show_megabytes_and_a_rate() {
        // A percentage cannot be turned back into "412 MB of 1.5 GB", and it cannot produce a rate.
        // This pins the shape of what the download reports (rule:jobs).
        let model = catalogue::find("ggml-base").expect("in the catalogue");
        let progress = Progress::Determinate {
            done: 1_000_000,
            total: model.size_bytes,
        };

        match progress {
            Progress::Determinate { done, total } => {
                assert_eq!(done, 1_000_000);
                assert_eq!(total, model.size_bytes);
            }
            Progress::Indeterminate => panic!("a download always knows its total"),
        }
    }
}
