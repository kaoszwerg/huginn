//! `huginn-asr-worker` — the deprivileged process that does the recognising (ADR-PROJ-005).
//!
//! # Why this is a separate program
//!
//! The main process holds the microphone, synthesises keystrokes, and on macOS carries accessibility
//! rights. It must **never** be the process that parses a model file with C++ code — least of all one
//! the user downloaded or brought themselves. A malformed GGML file that corrupts memory in *this*
//! process gets a pipe and a model file. In the main process it would get the keyboard.
//!
//! This binary therefore does exactly four things, and nothing else:
//!
//! 1. reads protocol lines from stdin,
//! 2. loads the one model file it is told to load,
//! 3. transcribes the audio that arrives on the same pipe,
//! 4. writes the text back on stdout.
//!
//! **No network. No keyboard. No filesystem beyond the model path.** It never opens a socket, and the
//! only path it ever touches is the one the app sends it.
//!
//! # stdout is the wire
//!
//! Nothing may print to stdout except protocol messages — a stray `println!` would corrupt the
//! stream. Logging goes to **stderr**, which the parent captures. whisper.cpp's own C++ chatter is
//! silenced in `huginn-asr` for the same reason.
//!
//! And the recognised text is never logged, at any level (ADR-PROJ-007): a log with transcripts in it
//! is a verbatim record of everything the user has ever said.

use huginn_asr::{SpeechEngine, WhisperEngine};
use huginn_asr_proto::{decode, encode, Request, Response, PROTOCOL_VERSION};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;

fn main() {
    // stderr, never stdout: stdout carries the protocol.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "huginn_asr_worker=info,huginn_asr=info".into()),
        )
        .init();

    tracing::info!(protocol = PROTOCOL_VERSION, "speech worker starting");

    let stdin = std::io::stdin();
    let mut reader = BufReader::new(stdin.lock());
    let mut stdout = std::io::stdout();

    if let Err(e) = send(
        &mut stdout,
        &Response::Ready {
            protocol: PROTOCOL_VERSION,
        },
    ) {
        tracing::error!(error = %e, "cannot announce readiness — the pipe is already gone");
        std::process::exit(1);
    }

    let mut engine: Option<WhisperEngine> = None;
    let mut line = String::new();

    loop {
        line.clear();
        match reader.read_line(&mut line) {
            // The app closed the pipe (it quit, or it is replacing us). Not an error.
            Ok(0) => {
                tracing::info!("the pipe closed — shutting down");
                break;
            }
            Ok(_) => {}
            Err(e) => {
                tracing::error!(error = %e, "cannot read from the pipe");
                break;
            }
        }

        let request: Request = match decode(&line) {
            Ok(r) => r,
            Err(e) => {
                // Junk on the wire is reported, not fatal: a worker that dies on a bad line takes
                // dictation down with it.
                tracing::warn!(error = %e, "unreadable request");
                let _ = send(
                    &mut stdout,
                    &Response::Error {
                        message: format!("the worker could not read that request: {e}"),
                    },
                );
                continue;
            }
        };

        match request {
            Request::LoadModel { path } => {
                let path = PathBuf::from(path);
                match WhisperEngine::load(&path) {
                    Ok(loaded) => {
                        // `load` logs its own duration; re-measuring here would be a second number
                        // for the same thing.
                        engine = Some(loaded);
                        let _ = send(&mut stdout, &Response::ModelLoaded { load_ms: 0 });
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "the model could not be loaded");
                        let _ = send(
                            &mut stdout,
                            &Response::Error {
                                message: e.to_string(),
                            },
                        );
                    }
                }
            }

            Request::Transcribe { samples, language } => {
                // The audio follows the header on the same pipe, as raw little-endian f32.
                let audio = match read_samples(&mut reader, samples) {
                    Ok(a) => a,
                    Err(e) => {
                        tracing::error!(error = %e, "the audio could not be read");
                        let _ = send(
                            &mut stdout,
                            &Response::Error {
                                message: format!("the audio did not arrive intact: {e}"),
                            },
                        );
                        // The stream is now out of sync with the protocol; there is no honest way to
                        // continue.
                        break;
                    }
                };

                let Some(engine) = engine.as_mut() else {
                    let _ = send(
                        &mut stdout,
                        &Response::Error {
                            message: "no speech model is loaded yet".into(),
                        },
                    );
                    continue;
                };

                match engine.transcribe(&audio, language.as_deref()) {
                    Ok(t) => {
                        let _ = send(
                            &mut stdout,
                            &Response::Transcript {
                                text: t.text,
                                inference_ms: t.inference_ms,
                                audio_seconds: t.audio_seconds,
                            },
                        );
                    }
                    Err(e) => {
                        tracing::error!(error = %e, "recognition failed");
                        let _ = send(
                            &mut stdout,
                            &Response::Error {
                                message: e.to_string(),
                            },
                        );
                    }
                }
            }

            Request::Shutdown => {
                tracing::info!("shutdown requested");
                break;
            }
        }
    }

    tracing::info!("speech worker stopped");
}

/// Read exactly `samples` little-endian `f32` values from the pipe.
///
/// Exactly that many — not "until the pipe is quiet". The next protocol line begins immediately
/// after, and reading one byte too many or too few desynchronises the stream permanently.
fn read_samples(reader: &mut impl Read, samples: u64) -> std::io::Result<Vec<f32>> {
    // A sanity bound before allocating: a corrupted header claiming 2^60 samples must not make the
    // worker try to allocate it (ADR-CORE-011 — validate at the boundary, even one we wrote).
    const MAX_SAMPLES: u64 = 16_000 * 60 * 10; // ten minutes of speech
    if samples > MAX_SAMPLES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("{samples} samples is more audio than Huginn will ever record"),
        ));
    }

    let mut bytes = vec![0u8; samples as usize * 4];
    reader.read_exact(&mut bytes)?;

    Ok(bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect())
}

fn send(out: &mut impl Write, response: &Response) -> std::io::Result<()> {
    let line = encode(response)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e.to_string()))?;
    out.write_all(line.as_bytes())?;
    // Flush every message: the app is waiting on this line, and a buffered response is a hang.
    out.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// The worker's half of the boundary contract (rule:testing). `huginn-asr-proto` pins the other.
    #[test]
    fn samples_are_read_back_exactly_as_they_were_written() {
        let original: Vec<f32> = vec![0.0, 1.0, -1.0, 0.5, -0.25];
        let mut wire: Vec<u8> = Vec::new();
        for s in &original {
            wire.extend_from_slice(&s.to_le_bytes());
        }

        let read = read_samples(&mut Cursor::new(wire), original.len() as u64).expect("read");
        assert_eq!(read, original);
    }

    #[test]
    fn only_the_announced_samples_are_consumed_leaving_the_next_line_intact() {
        // The bug this prevents: reading one byte too many desynchronises the pipe forever, and the
        // symptom would be "dictation stops working after a while".
        let mut wire: Vec<u8> = Vec::new();
        wire.extend_from_slice(&1.0f32.to_le_bytes());
        wire.extend_from_slice(&2.0f32.to_le_bytes());
        wire.extend_from_slice(b"{\"type\":\"shutdown\"}\n");

        let mut cursor = Cursor::new(wire);
        let audio = read_samples(&mut cursor, 2).expect("read the audio");
        assert_eq!(audio, vec![1.0, 2.0]);

        let mut rest = String::new();
        BufReader::new(&mut cursor)
            .read_line(&mut rest)
            .expect("the next protocol line must still be there");
        let next: Request = decode(&rest).expect("decode");
        assert_eq!(next, Request::Shutdown);
    }

    #[test]
    fn an_absurd_sample_count_is_refused_before_it_is_allocated() {
        // A corrupted header must not turn into a multi-gigabyte allocation.
        let err = read_samples(&mut Cursor::new(Vec::new()), u64::MAX).expect_err("must refuse");
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidData);
    }

    #[test]
    fn a_truncated_audio_stream_is_an_error_not_silence() {
        // Fewer bytes than announced: the recording must fail loudly rather than transcribe half a
        // sentence and pretend that is what the user said.
        let mut wire: Vec<u8> = Vec::new();
        wire.extend_from_slice(&1.0f32.to_le_bytes());

        let err = read_samples(&mut Cursor::new(wire), 10).expect_err("must fail");
        assert_eq!(err.kind(), std::io::ErrorKind::UnexpectedEof);
    }
}
