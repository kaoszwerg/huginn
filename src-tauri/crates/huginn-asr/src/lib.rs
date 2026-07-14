//! Speech recognition (ADR-PROJ-005).
//!
//! **This crate is linked into the worker process, never into the app.** The process that holds the
//! microphone, synthesises keystrokes and (on macOS) has accessibility rights must never be the one
//! parsing a model file with C++ code — least of all a model the user brought themselves. The
//! boundary is the point; do not optimise it away.
//!
//! The engine sits behind [`SpeechEngine`] so the choice can be revisited without touching the
//! callers. whisper.cpp is the first implementation, and it earned that on a measurement, not on
//! reputation (ADR-CORE-004): on German audio, `base` scored the same word-error rate as `small`
//! while running 3.4x faster.

mod whisper;

pub use whisper::WhisperEngine;

/// What went wrong. Every variant is written for a user to read: it is what the UI shows.
#[derive(Debug, thiserror::Error)]
pub enum AsrError {
    #[error("the model file could not be loaded: {0}")]
    ModelLoad(String),

    #[error("the recognition failed: {0}")]
    Inference(String),

    /// Audio arrived in a shape the engine cannot use. A defect in *our* pipeline, not the user's
    /// fault — but it is still reported rather than papered over with silence.
    #[error("the audio is not usable: {0}")]
    Audio(String),
}

pub type Result<T> = std::result::Result<T, AsrError>;

/// What the engine hands back.
#[derive(Debug, Clone, PartialEq)]
pub struct Transcript {
    /// The recognised words. **Never logged, never persisted, never sent anywhere** (ADR-PROJ-007).
    pub text: String,
    /// How long the recognition took. This one *is* logged — it is a duration, not content.
    pub inference_ms: u64,
    /// Seconds of audio that went in. Also loggable: a count, not content.
    pub audio_seconds: f64,
}

impl Transcript {
    /// Speed relative to speech: 2.0 means it recognised twice as fast as the words were spoken.
    /// Below 1.0 the user waits longer than they spoke, which is where a dictation tool stops being
    /// one.
    pub fn real_time_factor(&self) -> f64 {
        if self.inference_ms == 0 {
            return 0.0;
        }
        self.audio_seconds / (self.inference_ms as f64 / 1000.0)
    }
}

/// The recognition engine.
///
/// Audio is **16 kHz mono f32** — whisper's native format, and what `huginn-audio` resamples to.
/// Handing it anything else is a defect, not a conversion the engine is expected to perform: doing
/// it here would hide a resampling step inside the hot path and make it invisible to measurement.
pub trait SpeechEngine: Send {
    /// Transcribe. `language` is an ISO code (`"de"`); `None` lets the model detect it, which costs
    /// time and is less accurate when the language is already known.
    fn transcribe(&mut self, audio: &[f32], language: Option<&str>) -> Result<Transcript>;
}

/// The sample rate every part of the pipeline agrees on. Whisper is trained at 16 kHz; feeding it
/// anything else does not fail, it just quietly recognises worse.
pub const SAMPLE_RATE: u32 = 16_000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_real_time_factor_says_whether_the_user_waits() {
        // 10 seconds of speech recognised in 5 seconds: twice as fast as talking.
        let fast = Transcript {
            text: String::new(),
            inference_ms: 5_000,
            audio_seconds: 10.0,
        };
        assert_eq!(fast.real_time_factor(), 2.0);

        // Recognition slower than speech — the case that makes a dictation tool useless.
        let slow = Transcript {
            text: String::new(),
            inference_ms: 20_000,
            audio_seconds: 10.0,
        };
        assert!(slow.real_time_factor() < 1.0);
    }

    #[test]
    fn a_zero_duration_does_not_divide_by_zero() {
        let t = Transcript {
            text: String::new(),
            inference_ms: 0,
            audio_seconds: 5.0,
        };
        assert_eq!(t.real_time_factor(), 0.0);
    }
}
