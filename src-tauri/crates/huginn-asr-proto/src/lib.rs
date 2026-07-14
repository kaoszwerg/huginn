//! The wire protocol between Huginn and its speech worker (ADR-PROJ-005).
//!
//! The worker is a **separate, deprivileged process**: no keyboard, no network, no filesystem beyond
//! the model file. This crate is the only thing the two sides share, and it is pinned by tests on
//! **both** of them (rule:testing) — a reworded message must not be able to break its consumer
//! silently.
//!
//! ## The shape of the wire
//!
//! Newline-delimited JSON over the worker's stdin/stdout. One message per line, no framing beyond
//! the newline, no length prefix. It was chosen for one reason: when this breaks — and a
//! cross-process pipe carrying audio *will* break — the maintainer can read the wire.
//!
//! **Audio does not travel as JSON.** A base64'd second of 16 kHz float samples is 85 KB of text to
//! parse per second of speech. The samples go over the same pipe as raw little-endian `f32` bytes,
//! announced by the JSON message that precedes them ([`Request::Transcribe::samples`]). The header
//! says how many follow; the worker reads exactly that many and not one byte more.
//!
//! ## What must never cross this pipe
//!
//! The recognised text goes app-ward exactly once, in [`Response::Transcript`], and is inserted into
//! the focused window. It is never logged, never written to disk, never sent anywhere else
//! (ADR-PROJ-007). Audio never goes anywhere but into the worker.

use serde::{Deserialize, Serialize};

/// The protocol version. Bumped when a message changes shape.
///
/// The worker announces it in [`Response::Ready`] and the app refuses a worker that does not match:
/// a stale sidecar binary left behind by an interrupted update would otherwise fail in ways that
/// look like a broken model.
pub const PROTOCOL_VERSION: u32 = 1;

/// App → worker.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Request {
    /// Load a model. Sent once at startup and again whenever the user picks another model.
    LoadModel {
        /// Absolute path to the model file. The worker reads **only** this path — it is the single
        /// filesystem capability the worker has.
        path: String,
    },

    /// Transcribe the audio that follows this message on the same pipe.
    ///
    /// `samples` is the number of `f32` values (not bytes) that come next: the worker reads exactly
    /// `samples * 4` bytes of little-endian `f32` immediately after this line.
    Transcribe {
        samples: u64,
        /// ISO language code (`"de"`). `None` asks the model to detect it — slower, and less accurate
        /// when the language is in fact known.
        language: Option<String>,
    },

    /// Stop cleanly. The worker exits; the app does not have to kill it.
    Shutdown,
}

/// Worker → app.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Response {
    /// The worker is alive and speaking this protocol. Sent once, before anything else.
    Ready { protocol: u32 },

    /// The model is loaded and the worker can transcribe.
    ModelLoaded { load_ms: u64 },

    /// The recognised text. **The only message that ever carries content** (ADR-PROJ-007).
    Transcript {
        text: String,
        inference_ms: u64,
        audio_seconds: f64,
    },

    /// Something failed. `message` is written for a user to read — the UI shows it verbatim.
    ///
    /// A worker that dies without sending this is handled too (the app sees the pipe close and the
    /// process exit), but a worker that *can* explain itself must.
    Error { message: String },
}

/// Encode one message as a protocol line (JSON + `\n`).
pub fn encode<T: Serialize>(message: &T) -> Result<String, ProtocolError> {
    let mut line = serde_json::to_string(message).map_err(ProtocolError::Encode)?;
    line.push('\n');
    Ok(line)
}

/// Decode one protocol line.
pub fn decode<T: for<'de> Deserialize<'de>>(line: &str) -> Result<T, ProtocolError> {
    serde_json::from_str(line.trim()).map_err(ProtocolError::Decode)
}

#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("cannot encode a protocol message: {0}")]
    Encode(#[source] serde_json::Error),

    #[error("cannot decode a protocol message: {0}")]
    Decode(#[source] serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The contract, pinned on the side that defines it. The worker's own tests pin the other half:
    /// if these two ever disagree, dictation stops working and neither side reports a fault
    /// (rule:testing).
    #[test]
    fn every_request_round_trips() {
        for request in [
            Request::LoadModel {
                path: "C:/models/ggml-base.bin".into(),
            },
            Request::Transcribe {
                samples: 48_000,
                language: Some("de".into()),
            },
            Request::Transcribe {
                samples: 1,
                language: None,
            },
            Request::Shutdown,
        ] {
            let line = encode(&request).expect("encode");
            assert!(line.ends_with('\n'), "every message is one line");
            let back: Request = decode(&line).expect("decode");
            assert_eq!(back, request);
        }
    }

    #[test]
    fn every_response_round_trips() {
        for response in [
            Response::Ready { protocol: 1 },
            Response::ModelLoaded { load_ms: 190 },
            Response::Transcript {
                text: "Der Termin ist am Montag.".into(),
                inference_ms: 5_880,
                audio_seconds: 7.5,
            },
            Response::Error {
                message: "the model file could not be loaded".into(),
            },
        ] {
            let line = encode(&response).expect("encode");
            let back: Response = decode(&line).expect("decode");
            assert_eq!(back, response);
        }
    }

    #[test]
    fn the_tag_names_are_the_contract() {
        // The wire is JSON, and these strings are what the other side matches on. A rename here is a
        // breaking change, and this test is what makes that visible instead of silent.
        let line = encode(&Request::Shutdown).expect("encode");
        assert!(line.contains(r#""type":"shutdown""#), "got: {line}");

        let line = encode(&Response::Ready { protocol: 1 }).expect("encode");
        assert!(line.contains(r#""type":"ready""#), "got: {line}");
    }

    #[test]
    fn a_transcript_survives_umlauts_and_newlines() {
        // German text, and the dictated text may contain anything the user said. JSON escapes it;
        // this proves the escaping round-trips rather than corrupting the user's words.
        let spoken = "Grüße aus Köln — Straße, Fuß, Öl.\nZweite Zeile.";
        let line = encode(&Response::Transcript {
            text: spoken.into(),
            inference_ms: 1,
            audio_seconds: 1.0,
        })
        .expect("encode");

        assert_eq!(line.lines().count(), 1, "a message must stay on ONE line");

        let Response::Transcript { text, .. } = decode(&line).expect("decode") else {
            panic!("wrong variant");
        };
        assert_eq!(text, spoken);
    }

    #[test]
    fn a_line_of_garbage_is_an_error_not_a_panic() {
        // The other end of this pipe is a C++ library that prints to stdout when it feels like it.
        // Junk on the wire must be survivable.
        let result: Result<Response, _> = decode("whisper_init_from_file: loading model\n");
        assert!(result.is_err());
    }
}
