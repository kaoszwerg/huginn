//! The worker, proven end to end — as a real process, over the real pipe (ADR-PROJ-005).
//!
//! This is the test that the acoustic proof (`scripts/project/prove-dictation.ps1`) cannot be: it
//! feeds **known German audio** through the **actual protocol** into the **actual worker binary**, and
//! checks the words that come back. No microphone, no speakers, no room — so when it fails, it failed
//! for a reason in this repository.
//!
//! It is ignored by default: it needs a model file (~150 MB) that is not in the repo and never will
//! be. Run it with one present:
//!
//! ```text
//! cargo test -p huginn-asr-worker --test pipeline -- --ignored --nocapture
//! ```

use huginn_asr_proto::{decode, encode, Request, Response, PROTOCOL_VERSION};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

/// Where the fixtures live. Both are produced by `scripts/project/make-speech-fixture.ps1`; the model
/// is whatever the developer has installed.
fn model_path() -> std::path::PathBuf {
    std::env::var("HUGINN_TEST_MODEL")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| dirs_app_data().join("models").join("ggml-base.bin"))
}

fn audio_path() -> std::path::PathBuf {
    std::env::var("HUGINN_TEST_AUDIO")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("huginn-fixture-de.wav"))
}

fn dirs_app_data() -> std::path::PathBuf {
    // The dev channel's data directory. Only used to find a model a developer already has.
    let base = std::env::var("APPDATA").unwrap_or_default();
    std::path::PathBuf::from(base).join("ai.lysis.huginn.dev")
}

/// Read a 16 kHz mono WAV as f32 — the format the whole pipeline agrees on.
fn read_wav(path: &std::path::Path) -> Vec<f32> {
    let bytes = std::fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));

    // Minimal WAV parsing: find `data`, take what follows as 16-bit PCM. The fixture is written by us,
    // so this does not need to survive an arbitrary file — only ours.
    let data_at = bytes
        .windows(4)
        .position(|w| w == b"data")
        .expect("no data chunk in the fixture");
    let start = data_at + 8;

    bytes[start..]
        .chunks_exact(2)
        .map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32768.0)
        .collect()
}

#[test]
#[ignore = "needs a model file and an audio fixture; see the module docs"]
fn the_worker_turns_german_audio_into_german_text() {
    let model = model_path();
    let audio_file = audio_path();
    assert!(
        model.is_file(),
        "no model at {} — set HUGINN_TEST_MODEL or install one in the app",
        model.display()
    );
    assert!(
        audio_file.is_file(),
        "no audio at {} — run scripts/project/make-speech-fixture.ps1",
        audio_file.display()
    );

    let audio = read_wav(&audio_file);
    assert!(!audio.is_empty(), "the fixture is empty");

    // The real binary, as a real child process — not the library called in-process. The boundary IS
    // the thing under test (ADR-PROJ-005).
    let exe = env!("CARGO_BIN_EXE_huginn-asr-worker");
    let mut child = Command::new(exe)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("the worker binary must start");

    let mut stdin = child.stdin.take().expect("stdin");
    let mut stdout = BufReader::new(child.stdout.take().expect("stdout"));

    let mut read = || -> Response {
        let mut line = String::new();
        stdout.read_line(&mut line).expect("the worker must answer");
        decode(&line).unwrap_or_else(|e| panic!("unreadable answer {line:?}: {e}"))
    };

    // 1. It announces itself, in our protocol version.
    match read() {
        Response::Ready { protocol } => assert_eq!(protocol, PROTOCOL_VERSION),
        other => panic!("expected Ready, got {other:?}"),
    }

    // 2. It loads the model.
    stdin
        .write_all(
            encode(&Request::LoadModel {
                path: model.to_string_lossy().to_string(),
            })
            .expect("encode")
            .as_bytes(),
        )
        .expect("write");
    stdin.flush().expect("flush");

    match read() {
        Response::ModelLoaded { .. } => {}
        other => panic!("expected ModelLoaded, got {other:?}"),
    }

    // 3. It transcribes: the header, then the samples as raw little-endian f32.
    stdin
        .write_all(
            encode(&Request::Transcribe {
                samples: audio.len() as u64,
                language: Some("de".into()),
            })
            .expect("encode")
            .as_bytes(),
        )
        .expect("write");

    let mut raw = Vec::with_capacity(audio.len() * 4);
    for s in &audio {
        raw.extend_from_slice(&s.to_le_bytes());
    }
    stdin.write_all(&raw).expect("write the audio");
    stdin.flush().expect("flush");

    let text = match read() {
        Response::Transcript {
            text,
            inference_ms,
            audio_seconds,
        } => {
            println!(
                "recognised {:.2}s in {}ms ({:.1}x real time)",
                audio_seconds,
                inference_ms,
                audio_seconds / (inference_ms as f64 / 1000.0)
            );
            println!("transcript: {text}");
            text
        }
        other => panic!("expected a Transcript, got {other:?}"),
    };

    // 4. The words. The fixture speaks a known sentence; these are the words that must survive the
    //    microphone-less path from audio to text.
    let lower = text.to_lowercase();
    for word in ["termin", "montag", "konferenzraum"] {
        assert!(
            lower.contains(word),
            "the transcript is missing “{word}”: {text}"
        );
    }

    // 5. It shuts down cleanly rather than being killed.
    stdin
        .write_all(encode(&Request::Shutdown).expect("encode").as_bytes())
        .expect("write");
    stdin.flush().expect("flush");

    let status = child.wait().expect("the worker must exit");
    assert!(status.success(), "the worker exited with {status}");
}
