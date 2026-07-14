//! Installing the model that ships **inside the installer**, on first run (ADR-PROJ-006).
//!
//! The installer bundles the default model so a fresh install can dictate immediately, without the user
//! first downloading anything. This is **not** a network call and **not** "download on first launch"
//! (rule:model-assets): the file already shipped inside the signed installer. It is still **verified**
//! against the SHA-256 compiled into the binary before it is accepted — the same guarantee a download
//! gets — so a corrupted, truncated or swapped resource can never quietly become the model in use.

use crate::catalogue;
use crate::store::model_path;
use crate::{ModelError, Result};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::Path;

/// Read this much at a time when hashing — the same chunk the download uses.
const CHUNK: usize = 64 * 1024;

/// Install the **default** model from a bundled file into the store, if it is not already present.
///
/// * Already installed (present and the right size) → `Ok(false)`; nothing to do.
/// * No bundled file at `bundled_file` (a dev build that shipped none) → `Ok(false)`; the user can
///   still download a model from the settings. Not an error.
/// * Otherwise the file is copied in, verified against the compiled-in SHA-256, and only then made the
///   model on disk (`Ok(true)`). A mismatch deletes the copy and returns an error — an unverified file
///   never becomes the model in use.
pub fn install_default_if_missing(models_dir: &Path, bundled_file: &Path) -> Result<bool> {
    let model = catalogue::find(catalogue::DEFAULT_MODEL)
        .ok_or_else(|| ModelError::Unknown(catalogue::DEFAULT_MODEL.to_string()))?;
    let dest = model_path(models_dir, model.id);

    // Present and the right size already — the same size guard the store uses (a truncated file does
    // not count as installed). Nothing to do.
    if std::fs::metadata(&dest)
        .map(|m| m.is_file() && m.len() == model.size_bytes)
        .unwrap_or(false)
    {
        return Ok(false);
    }

    if !bundled_file.is_file() {
        tracing::info!(
            model = model.id,
            "no model shipped with this build — the user will be offered a download"
        );
        return Ok(false);
    }

    std::fs::create_dir_all(models_dir).map_err(|e| ModelError::Io {
        path: models_dir.display().to_string(),
        source: e,
    })?;

    install_verified(&dest, bundled_file, model.sha256)?;
    tracing::info!(
        model = model.id,
        "the bundled model was installed and verified"
    );
    Ok(true)
}

/// Copy `source` to `dest`, but only make it `dest` once its SHA-256 matches `expected_sha`.
///
/// Atomic, exactly like the download (ADR-PROJ-006): the bytes land in a `.part` file, are hashed, and
/// are renamed over `dest` only on a match. A mismatch deletes the `.part` and errors — the store never
/// sees a half-written or unverified file.
fn install_verified(dest: &Path, source: &Path, expected_sha: &str) -> Result<()> {
    let part = dest.with_extension("bin.part");

    std::fs::copy(source, &part).map_err(|e| ModelError::Io {
        path: part.display().to_string(),
        source: e,
    })?;

    let digest = sha256_of(&part)?;
    if digest != expected_sha {
        let _ = std::fs::remove_file(&part);
        tracing::error!(
            expected = expected_sha,
            got = %digest,
            "the bundled model's checksum does not match — the copy was deleted"
        );
        return Err(ModelError::ChecksumMismatch);
    }

    std::fs::rename(&part, dest).map_err(|e| ModelError::Io {
        path: dest.display().to_string(),
        source: e,
    })
}

/// The SHA-256 of a file, lowercase hex — the format the catalogue stores.
fn sha256_of(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path).map_err(|e| ModelError::Io {
        path: path.display().to_string(),
        source: e,
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; CHUNK];
    loop {
        let read = file.read(&mut buffer).map_err(|e| ModelError::Io {
            path: path.display().to_string(),
            source: e,
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh, empty temp directory for one test — the convention this crate already uses (store.rs),
    /// rather than pulling in a dev-dependency just for the tests. Removed and recreated so a leftover
    /// from a previous run cannot make a test lie.
    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("huginn-bundled-{name}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sha_hex(bytes: &[u8]) -> String {
        let mut h = Sha256::new();
        h.update(bytes);
        h.finalize().iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn sha256_of_matches_a_known_vector() {
        let dir = temp_dir("sha");
        let p = dir.join("f");
        std::fs::write(&p, b"abc").unwrap();
        // The canonical SHA-256("abc").
        assert_eq!(
            sha256_of(&p).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_whose_hash_matches_is_installed_and_leaves_no_part_behind() {
        let dir = temp_dir("verify-ok");
        let src = dir.join("bundled.bin");
        let bytes = b"a small stand-in for a model file";
        std::fs::write(&src, bytes).unwrap();
        let dest = dir.join("ggml-base.bin");

        install_verified(&dest, &src, &sha_hex(bytes)).expect("a matching file is accepted");

        assert!(dest.is_file(), "the model is in place");
        assert!(
            !dest.with_extension("bin.part").exists(),
            "the .part file is renamed away, not left behind"
        );
        assert_eq!(std::fs::read(&dest).unwrap(), bytes);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_file_whose_hash_is_wrong_is_rejected_and_cleaned_up() {
        let dir = temp_dir("verify-bad");
        let src = dir.join("bundled.bin");
        std::fs::write(&src, b"the wrong bytes entirely").unwrap();
        let dest = dir.join("ggml-base.bin");

        let err = install_verified(&dest, &src, &"0".repeat(64)).expect_err("must reject");
        assert!(matches!(err, ModelError::ChecksumMismatch));
        assert!(!dest.exists(), "an unverified file never becomes the model");
        assert!(
            !dest.with_extension("bin.part").exists(),
            "the rejected .part is removed"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn nothing_is_installed_and_it_is_not_an_error_when_no_model_is_bundled() {
        let dir = temp_dir("noop");
        let missing = dir.join("not-shipped.bin");
        assert!(
            !install_default_if_missing(&dir, &missing).unwrap(),
            "a build with no bundled model just leaves the download path to the user"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
