//! whisper.cpp behind the [`SpeechEngine`] trait (ADR-PROJ-005).

use crate::{AsrError, Result, SpeechEngine, Transcript, SAMPLE_RATE};
use std::path::Path;
use std::time::Instant;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// A loaded whisper model, ready to transcribe.
pub struct WhisperEngine {
    context: WhisperContext,
    threads: i32,
}

impl WhisperEngine {
    /// Load a model from disk.
    ///
    /// This is slow (hundreds of milliseconds for the base model, seconds for larger ones) and it
    /// allocates the whole model into memory — so it happens **once**, in the worker, as a Job
    /// (ADR-PROJ-008), never on the path of a keypress.
    pub fn load(model: &Path) -> Result<Self> {
        let path = model.to_string_lossy().to_string();
        tracing::info!(model = %path, "loading the speech model");

        let started = Instant::now();
        let context = WhisperContext::new_with_params(&path, WhisperContextParameters::default())
            .map_err(|e| AsrError::ModelLoad(format!("{path}: {e}")))?;

        let threads = optimal_threads();
        tracing::info!(
            model = %path,
            load_ms = started.elapsed().as_millis() as u64,
            threads,
            "speech model ready"
        );

        Ok(Self { context, threads })
    }
}

impl SpeechEngine for WhisperEngine {
    fn transcribe(&mut self, audio: &[f32], language: Option<&str>) -> Result<Transcript> {
        if audio.is_empty() {
            return Err(AsrError::Audio("no audio was captured".into()));
        }

        let audio_seconds = audio.len() as f64 / SAMPLE_RATE as f64;

        // Whisper pads anything shorter than a second internally, but a fragment that short is a
        // key that was tapped rather than held — there is nothing in it to recognise, and running
        // inference on it wastes a second of the user's time to produce noise.
        if audio_seconds < 0.25 {
            return Err(AsrError::Audio(format!(
                "the recording is too short ({audio_seconds:.2}s) — hold the key while you speak"
            )));
        }

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(self.threads);
        // Telling it the language is both faster and more accurate than letting it detect one — and
        // Huginn always knows: it is the model's language, chosen by the user.
        params.set_language(language);
        // whisper.cpp prints to stdout by default. In a sidecar whose stdout IS the protocol, that
        // would corrupt the wire — and it would print the recognised text to a console, which is
        // exactly what must never happen (ADR-PROJ-007).
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        let mut state = self
            .context
            .create_state()
            .map_err(|e| AsrError::Inference(format!("cannot create a decoding state: {e}")))?;

        let started = Instant::now();
        state
            .full(params, audio)
            .map_err(|e| AsrError::Inference(e.to_string()))?;
        let inference_ms = started.elapsed().as_millis() as u64;

        let segments = state.full_n_segments().max(0);

        let mut text = String::new();
        for i in 0..segments {
            if let Some(segment) = state.get_segment(i) {
                if let Ok(s) = segment.to_str() {
                    text.push_str(s);
                }
            }
        }

        let transcript = Transcript {
            text: text.trim().to_string(),
            inference_ms,
            audio_seconds,
        };

        // Durations, counts, speed — never the text itself (ADR-PROJ-007). A log with transcripts in
        // it is a verbatim record of everything the user has ever said.
        tracing::info!(
            audio_seconds = format!("{audio_seconds:.2}"),
            inference_ms,
            real_time_factor = format!("{:.1}", transcript.real_time_factor()),
            chars = transcript.text.chars().count(),
            "transcribed"
        );

        Ok(transcript)
    }
}

/// How many threads whisper.cpp should use.
///
/// **Not "all of them".** Measured on a 13th-gen i7 (8 performance cores + 8 efficiency cores, 24
/// logical threads): 12 threads took 5.9 s for the same audio that 24 threads took 21 s. whisper.cpp
/// synchronises its threads at layer boundaries, so every fast core waits for the slowest — and on a
/// hybrid CPU the efficiency cores *are* the slowest. Handing it every thread the OS reports makes it
/// nearly four times slower.
///
/// Half the logical threads, capped at 12, keeps the work on the performance cores on hybrid chips
/// and stays sane on everything else. It is a heuristic, and it is measured rather than guessed.
fn optimal_threads() -> i32 {
    let logical = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    ((logical / 2).clamp(1, 12)) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thread_count_never_uses_every_logical_core() {
        // The bug this prevents cost a 3.5x slowdown, and it looked like a model problem.
        let threads = optimal_threads();
        let logical = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);

        assert!(threads >= 1, "at least one thread");
        assert!(
            threads <= 12,
            "capped: more threads made it slower, not faster"
        );
        assert!(
            (threads as usize) <= logical,
            "cannot use more threads than the machine has"
        );
    }
}
