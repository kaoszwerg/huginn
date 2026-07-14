//! Talking to the speech worker process (ADR-PROJ-005).
//!
//! The worker is a child process with a pipe. This is the app's half of the protocol that
//! `huginn-asr-proto` defines and that both sides pin with tests.
//!
//! **A crashed worker is not a crashed app.** whisper.cpp is C++ parsing a binary model file; if it
//! dies, it dies over there, and the user is told rather than losing the application. The next
//! recording starts a new worker.

use crate::error::{AppError, Result};
use huginn_asr_proto::{decode, encode, Request, Response, PROTOCOL_VERSION};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// A running worker process.
pub struct WorkerHandle {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl WorkerHandle {
    /// Start the worker and wait for it to announce itself.
    pub fn spawn(app: &tauri::AppHandle) -> Result<Self> {
        let exe = worker_path(app)?;
        tracing::info!(worker = %exe.display(), "starting the speech worker");

        let mut command = Command::new(&exe);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            // stderr is the worker's log. Inherited, so it lands in ours.
            .stderr(Stdio::inherit());

        // No console window on Windows: the worker is a background process, and a flashing black box
        // on every model load would be a defect the user sees.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command.spawn().map_err(|e| {
            AppError::Other(format!(
                "the speech worker could not be started ({}): {e}",
                exe.display()
            ))
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Other("the worker has no stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Other("the worker has no stdout".into()))?;

        let mut worker = Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        };

        // It must say hello before anything else, and it must speak our protocol version. A stale
        // sidecar binary left behind by an interrupted update would otherwise fail later, in ways
        // that look like a broken model.
        match worker.read_response()? {
            Response::Ready { protocol } if protocol == PROTOCOL_VERSION => {
                tracing::info!(protocol, "the speech worker is ready");
                Ok(worker)
            }
            Response::Ready { protocol } => Err(AppError::Other(format!(
                "the speech worker speaks protocol {protocol}, this app speaks {PROTOCOL_VERSION} \
                 — the installation is inconsistent"
            ))),
            other => Err(AppError::Other(format!(
                "the speech worker said something unexpected on startup: {other:?}"
            ))),
        }
    }

    /// Load a model. Blocks until the worker has it in memory.
    pub fn load_model(&mut self, path: &Path) -> Result<()> {
        self.send(&Request::LoadModel {
            path: path.to_string_lossy().to_string(),
        })?;

        match self.read_response()? {
            Response::ModelLoaded { .. } => {
                tracing::info!(model = %path.display(), "the speech model is loaded");
                Ok(())
            }
            Response::Error { message } => Err(AppError::Other(message)),
            other => Err(AppError::Other(format!(
                "the worker answered a model load with {other:?}"
            ))),
        }
    }

    /// Send audio, get text back.
    ///
    /// **The returned text is never logged here or anywhere else** (ADR-PROJ-007).
    pub fn transcribe(&mut self, audio: &[f32], language: Option<&str>) -> Result<String> {
        self.send(&Request::Transcribe {
            samples: audio.len() as u64,
            language: language.map(str::to_string),
        })?;

        // The samples follow the header immediately, as raw little-endian f32 — 85 KB of base64 per
        // second of speech is not a thing worth doing.
        let mut bytes = Vec::with_capacity(audio.len() * 4);
        for sample in audio {
            bytes.extend_from_slice(&sample.to_le_bytes());
        }
        self.stdin.write_all(&bytes).map_err(|e| {
            AppError::Other(format!("the audio could not be sent to the worker: {e}"))
        })?;
        self.stdin.flush().map_err(|e| {
            AppError::Other(format!("the audio could not be sent to the worker: {e}"))
        })?;

        match self.read_response()? {
            Response::Transcript {
                text,
                inference_ms,
                audio_seconds,
            } => {
                tracing::info!(
                    inference_ms,
                    audio_seconds = format!("{audio_seconds:.2}"),
                    real_time_factor = format!(
                        "{:.1}",
                        audio_seconds / (inference_ms as f64 / 1000.0).max(0.001)
                    ),
                    "the worker transcribed the audio"
                );
                Ok(text)
            }
            Response::Error { message } => Err(AppError::Other(message)),
            other => Err(AppError::Other(format!(
                "the worker answered a transcription with {other:?}"
            ))),
        }
    }

    /// Ask the worker to stop, and do not wait forever if it will not.
    pub fn shutdown(mut self) {
        let _ = self.send(&Request::Shutdown);
        // It exits on its own; if it does not, it is killed. A worker that will not die must not keep
        // the app from quitting.
        match self.child.wait() {
            Ok(status) => tracing::info!(?status, "the speech worker stopped"),
            Err(e) => {
                tracing::warn!(error = %e, "the speech worker did not stop — killing it");
                let _ = self.child.kill();
            }
        }
    }

    fn send(&mut self, request: &Request) -> Result<()> {
        let line = encode(request).map_err(|e| AppError::Other(e.to_string()))?;
        self.stdin
            .write_all(line.as_bytes())
            .map_err(|e| AppError::Other(format!("the worker's pipe is closed: {e}")))?;
        self.stdin
            .flush()
            .map_err(|e| AppError::Other(format!("the worker's pipe is closed: {e}")))
    }

    fn read_response(&mut self) -> Result<Response> {
        let mut line = String::new();
        let read = self
            .stdout
            .read_line(&mut line)
            .map_err(|e| AppError::Other(format!("the worker's pipe broke: {e}")))?;

        if read == 0 {
            // The pipe closed: the worker died. This is the case that must never take the app with
            // it (ADR-PROJ-005 — a crash is logged, surfaced, and the worker is restarted).
            return Err(AppError::Other(
                "the speech worker stopped unexpectedly — recognition is unavailable until it is \
                 restarted"
                    .into(),
            ));
        }

        decode(&line)
            .map_err(|e| AppError::Other(format!("the worker's answer was unreadable: {e}")))
    }
}

/// Where the worker binary is.
///
/// In a bundled app it sits next to the main executable. In development it is in the same Cargo
/// target directory — which is where `cargo build --workspace` puts it.
fn worker_path(_app: &tauri::AppHandle) -> Result<std::path::PathBuf> {
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Other(format!("cannot find our own executable: {e}")))?;
    let dir = exe
        .parent()
        .ok_or_else(|| AppError::Other("our executable has no directory".into()))?;

    let name = if cfg!(target_os = "windows") {
        "huginn-asr-worker.exe"
    } else {
        "huginn-asr-worker"
    };

    let path = dir.join(name);
    if !path.is_file() {
        return Err(AppError::Other(format!(
            "the speech worker is missing ({}). The installation is incomplete.",
            path.display()
        )));
    }
    Ok(path)
}
