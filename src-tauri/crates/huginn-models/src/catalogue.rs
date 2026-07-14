//! The model catalogue (ADR-PROJ-006).
//!
//! **Compiled into the binary and signed with it.** There is no remote manifest and no update check —
//! an update check is a phone-home, and `rule:privacy` names "auto-update pings" explicitly. A new
//! model reaches the user through an app update they downloaded and ran.
//!
//! This is not ceremony. The moment the catalogue is fetched from a server, *the server* — not the
//! signed binary — decides which file with which hash gets installed, and the checksum stops being a
//! security property and becomes an error-detection code.

use serde::{Deserialize, Serialize};

/// A model Huginn can install.
///
/// This is a **backend-only** type: it carries the download URL and the compiled-in SHA-256, which
/// the frontend has no business seeing. The view gets [`crate::store::ModelStatus`] instead — the same
/// model, minus the machinery. So no `ts_rs::TS` here, on purpose (least privilege at the boundary,
/// rule:security).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelInfo {
    /// Stable id — the file name on disk, and what the settings store.
    pub id: &'static str,
    /// What the user reads.
    pub label: &'static str,
    /// Where it comes from. HTTPS, always, and one host.
    pub url: &'static str,
    /// SHA-256 of the file, compiled in. This is the whole point of the catalogue.
    pub sha256: &'static str,
    /// Bytes. Shown before the download, so nobody is surprised by a gigabyte.
    pub size_bytes: u64,
    /// True when the model handles many languages, German among them.
    pub multilingual: bool,
    /// A one-line description of the trade-off, in the user's terms — not in FLOPs.
    pub note: &'static str,
}

impl ModelInfo {
    /// Rough megabytes, for the UI.
    pub fn size_mb(&self) -> u64 {
        self.size_bytes / 1_000_000
    }
}

/// The models Huginn ships knowledge of.
///
/// **Whisper's multilingual models are the default, and they cover German and English both.** There
/// is no German-only Whisper model — the multilingual weights are what recognise German at all. The
/// `.en` variants are English-only specialists: faster on English, useless on German, and therefore
/// an explicit choice a user makes, never a default (the maintainer's call).
pub const MODELS: &[ModelInfo] = &[
    ModelInfo {
        id: "ggml-base",
        label: "Standard (multilingual)",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
        sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
        size_bytes: 147_951_465,
        multilingual: true,
        note: "Recognises German and English. Fast enough to keep up with speech on a normal CPU.",
    },
    ModelInfo {
        id: "ggml-small",
        label: "Large (multilingual)",
        url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
        sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
        size_bytes: 487_601_967,
        multilingual: true,
        note: "More accurate on difficult audio, but roughly three times slower to recognise.",
    },
];

/// Look a model up by id. `None` for an id that is not in the catalogue — which is what a settings
/// file edited by hand, or written by a newer version, can contain.
pub fn find(id: &str) -> Option<&'static ModelInfo> {
    MODELS.iter().find(|m| m.id == id)
}

/// What a fresh install uses: the multilingual model that speaks German (the maintainer's call).
pub const DEFAULT_MODEL: &str = "ggml-base";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_model_exists_and_speaks_german() {
        let model = find(DEFAULT_MODEL).expect("the default must be in the catalogue");
        assert!(
            model.multilingual,
            "the default has to recognise German, and only the multilingual weights do"
        );
    }

    #[test]
    fn every_model_carries_a_checksum_and_an_https_url() {
        // The checksum is the security property (ADR-PROJ-006): the file is verified against a value
        // compiled into the signed binary. A missing or short hash would silently disable that.
        for m in MODELS {
            assert_eq!(m.sha256.len(), 64, "{}: not a SHA-256", m.id);
            assert!(
                m.sha256.chars().all(|c| c.is_ascii_hexdigit()),
                "{}: the checksum is not hex",
                m.id
            );
            assert!(
                m.url.starts_with("https://"),
                "{}: a model may only be fetched over HTTPS",
                m.id
            );
            assert!(m.size_bytes > 0, "{}: no size", m.id);
        }
    }

    #[test]
    fn model_ids_are_unique() {
        // The id is the file name on disk. Two models sharing one would overwrite each other.
        let mut ids: Vec<_> = MODELS.iter().map(|m| m.id).collect();
        ids.sort_unstable();
        let count = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), count, "duplicate model id");
    }

    #[test]
    fn there_is_no_url_field_a_user_could_ever_fill_in() {
        // A product that downloads an arbitrary URL on request is a generic downloader and a
        // social-engineering vector ("just fetch this model from this link"). The catalogue is
        // `&'static` for that reason — there is no code path that can add an entry at runtime.
        // This test exists to make that a decision rather than an accident (ADR-PROJ-006).
        let _: &'static [ModelInfo] = MODELS;
    }
}
