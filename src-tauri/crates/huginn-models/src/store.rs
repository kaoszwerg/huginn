//! Where models live on disk (ADR-PROJ-006, ADR-PROJ-007).

use crate::catalogue::{self, ModelInfo};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// A model as the settings view sees it: what it is, and whether it is actually here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
pub struct ModelStatus {
    pub id: String,
    pub label: String,
    pub note: String,
    pub size_mb: u64,
    pub multilingual: bool,
    /// True when the file is on disk **and** verified. A downloaded-but-unverified file does not
    /// count as installed — that is the whole point of verifying it.
    pub installed: bool,
}

/// Where a model file lives.
///
/// One file per model id, under the app's own data directory. Content-addressed storage was
/// considered and dropped: with a handful of models from a fixed catalogue it buys nothing but a
/// directory of unreadable hashes, and the maintainer has to be able to look in this folder and see
/// what is there.
pub fn model_path(models_dir: &Path, id: &str) -> PathBuf {
    models_dir.join(format!("{id}.bin"))
}

/// The catalogue, annotated with what is on disk right now.
pub fn installed(models_dir: &Path) -> Vec<ModelStatus> {
    catalogue::MODELS
        .iter()
        .map(|m| ModelStatus {
            id: m.id.to_string(),
            label: m.label.to_string(),
            note: m.note.to_string(),
            size_mb: m.size_mb(),
            multilingual: m.multilingual,
            installed: is_installed(models_dir, m),
        })
        .collect()
}

/// Is this model present and the right size?
///
/// The size check is a cheap guard against a half-written file from an interrupted download — a
/// crash mid-download would otherwise leave a truncated file that looks installed. The **checksum**
/// is what actually decides whether a file may be used, and it is verified when the file is written
/// (`download_and_verify`), not on every startup: hashing 500 MB on each launch would cost the user a
/// second of startup for a check that cannot have changed.
fn is_installed(models_dir: &Path, model: &ModelInfo) -> bool {
    let path = model_path(models_dir, model.id);
    std::fs::metadata(&path)
        .map(|m| m.is_file() && m.len() == model.size_bytes)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn a_model_file_is_named_after_its_id() {
        let path = model_path(Path::new("C:/data/models"), "ggml-base");
        assert!(path.ends_with("ggml-base.bin"));
    }

    #[test]
    fn nothing_is_installed_in_an_empty_directory() {
        let dir = std::env::temp_dir().join("huginn-models-test-empty");
        let _ = std::fs::create_dir_all(&dir);
        assert!(installed(&dir).iter().all(|m| !m.installed));
    }

    #[test]
    fn a_truncated_file_from_an_interrupted_download_does_not_count_as_installed() {
        // The failure this prevents: a crash mid-download leaves 40 MB of a 148 MB model, the app
        // hands it to whisper, and the user gets "the model could not be loaded" with no idea why.
        let dir = std::env::temp_dir().join("huginn-models-test-truncated");
        let _ = std::fs::create_dir_all(&dir);

        let model = catalogue::find("ggml-base").expect("in the catalogue");
        let path = model_path(&dir, model.id);
        let mut f = std::fs::File::create(&path).expect("create");
        f.write_all(b"not the whole model").expect("write");
        drop(f);

        let status = installed(&dir);
        let base = status.iter().find(|m| m.id == "ggml-base").expect("listed");
        assert!(!base.installed, "a partial file must not read as installed");

        let _ = std::fs::remove_file(&path);
    }
}
