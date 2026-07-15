//! Microphone capture (ADR-PROJ-005).
//!
//! **The audio never leaves this process except into the worker's pipe, and it is never written to
//! disk.** Not to a temp file, not "just for debugging". The buffer is dropped as soon as the
//! transcription is done (ADR-PROJ-007).
//!
//! Capture runs only while the push-to-talk key is held. There is no wake word, no always-listening
//! mode, and no code path that starts the microphone without a key being down — that is the product's
//! whole promise, and it is enforced by the fact that [`Recorder::start`] is called from exactly one
//! place.

pub mod cue;
mod resample;

pub use cue::Cue;
pub use resample::resample_to_16k;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use ts_rs::TS;

/// The microphone's input level, shared between the capture callback (which raises it) and the UI pump
/// (which reads and resets it, ~20×/s, to drive the overlay meter — ADR-PROJ-004).
///
/// Lock-free on purpose: the audio callback runs on a real-time thread and must **never** block on a
/// mutex — a stalled callback is dropped audio, which is lost words.
#[derive(Clone, Default)]
struct SharedLevel(Arc<AtomicU32>);

impl SharedLevel {
    /// Raise the stored peak to at least `peak`. Called from the audio callback.
    fn observe(&self, peak: f32) {
        let mut cur = self.0.load(Ordering::Relaxed);
        while f32::from_bits(cur) < peak {
            match self.0.compare_exchange_weak(
                cur,
                peak.to_bits(),
                Ordering::Relaxed,
                Ordering::Relaxed,
            ) {
                Ok(_) => break,
                Err(actual) => cur = actual,
            }
        }
    }

    /// The peak seen since the last call, resetting to zero — so each poll reads its own window.
    fn take(&self) -> f32 {
        f32::from_bits(self.0.swap(0, Ordering::Relaxed))
    }
}

/// What whisper wants, and therefore what everything here converts to (ADR-PROJ-005).
pub const TARGET_SAMPLE_RATE: u32 = 16_000;

/// Ten minutes. A push-to-talk key held for ten minutes is a key that is stuck, not a person
/// dictating — and without a bound, a stuck key would grow the buffer until the machine died.
const MAX_SECONDS: usize = 600;

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("no microphone is available")]
    NoDevice,

    #[error("the microphone could not be opened: {0}")]
    Device(String),

    #[error("the microphone stopped: {0}")]
    Stream(String),
}

pub type Result<T> = std::result::Result<T, AudioError>;

/// An input device the user can choose (ADR-PROJ-004: everything is configurable).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
pub struct AudioDevice {
    /// The device's name, which is also its id: cpal has no stable device id, and a name is what the
    /// user recognises anyway. A renamed or unplugged device therefore falls back to the default —
    /// see [`Recorder::start`].
    pub name: String,
    /// True for the system's default input device.
    pub is_default: bool,
}

/// Every microphone the system offers, with the default marked.
pub fn input_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_name = host
        .default_input_device()
        .and_then(|d| device_name(&d))
        .unwrap_or_default();

    let devices = host
        .input_devices()
        .map_err(|e| AudioError::Device(e.to_string()))?
        .filter_map(|d| device_name(&d))
        .map(|name| AudioDevice {
            is_default: name == default_name,
            name,
        })
        .collect::<Vec<_>>();

    tracing::debug!(count = devices.len(), "input devices enumerated");
    Ok(devices)
}

/// A device's human name.
///
/// cpal 0.18 moved this behind `description()` — a device may refuse to describe itself (it was
/// unplugged between being listed and being asked), and that is a `None`, not a panic.
fn device_name(device: &cpal::Device) -> Option<String> {
    device.description().ok().map(|d| d.name().to_string())
}

/// A live recording. Dropping it stops the microphone.
pub struct Recorder {
    stream: cpal::Stream,
    captured: Arc<Mutex<Vec<f32>>>,
    level: SharedLevel,
    source_rate: u32,
    channels: u16,
}

impl Recorder {
    /// Open the microphone and start capturing.
    ///
    /// `device` is the name the user picked, or `None` for the system default. **A name that is no
    /// longer there falls back to the default rather than failing**: a user who unplugs a headset
    /// mid-day should still be able to dictate, and finding out that their chosen microphone vanished
    /// is not worth losing the sentence they are speaking.
    pub fn start(device: Option<&str>) -> Result<Self> {
        let host = cpal::default_host();

        let device = match device {
            Some(wanted) => host
                .input_devices()
                .map_err(|e| AudioError::Device(e.to_string()))?
                .find(|d| device_name(d).map(|n| n == wanted).unwrap_or(false))
                .or_else(|| {
                    tracing::warn!(
                        wanted,
                        "the chosen microphone is not available — falling back to the default"
                    );
                    host.default_input_device()
                }),
            None => host.default_input_device(),
        }
        .ok_or(AudioError::NoDevice)?;

        let name = device_name(&device).unwrap_or_else(|| "<unnamed>".to_string());
        let config = device
            .default_input_config()
            .map_err(|e| AudioError::Device(format!("{name}: {e}")))?;

        let source_rate = config.sample_rate();
        let channels = config.channels();

        tracing::info!(
            device = %name,
            source_rate,
            channels,
            format = ?config.sample_format(),
            "microphone open"
        );

        let captured: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(
            source_rate as usize * channels as usize * 4,
        )));
        let sink = captured.clone();
        let level = SharedLevel::default();
        let cap = MAX_SECONDS * source_rate as usize * channels as usize;

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                build_stream::<f32>(&device, config.into(), sink, level.clone(), cap)
            }
            cpal::SampleFormat::I16 => {
                build_stream::<i16>(&device, config.into(), sink, level.clone(), cap)
            }
            cpal::SampleFormat::U16 => {
                build_stream::<u16>(&device, config.into(), sink, level.clone(), cap)
            }
            other => Err(AudioError::Device(format!(
                "{name}: unsupported sample format {other:?}"
            ))),
        }?;

        stream
            .play()
            .map_err(|e| AudioError::Stream(format!("{name}: {e}")))?;

        Ok(Self {
            stream,
            captured,
            level,
            source_rate,
            channels,
        })
    }

    /// The input level since the last call, `0.0..=1.0` — the peak amplitude the microphone captured in
    /// that window, reset each time. Polled ~20×/s to drive the overlay meter, so the user can see that
    /// their voice is arriving and how strongly (ADR-PROJ-004). Reading it resets the window.
    pub fn level(&self) -> f32 {
        self.level.take()
    }

    /// Stop the microphone and hand over the audio (16 kHz mono, what whisper wants) together with
    /// whether the microphone actually captured a usable signal.
    ///
    /// Consumes the recorder — a recording is finished exactly once, and the samples are moved out
    /// rather than copied, so no second owner can keep the user's voice alive. The `bool` is `true` when
    /// the capture stayed below the noise floor (`captured_too_quiet`): a muted mic, an input set too
    /// low, or the wrong device. The caller surfaces that to the user as its own outcome, rather than
    /// running whisper on silence and reporting a generic "nothing recognised" (ADR-PROJ-004).
    pub fn finish(self) -> (Vec<f32>, bool) {
        // Stop capturing *before* taking the buffer, or the last callback races the read.
        drop(self.stream);

        let raw = match self.captured.lock() {
            Ok(mut buffer) => std::mem::take(&mut *buffer),
            Err(poisoned) => {
                // A panicking audio callback poisoned the lock. The samples are still there and still
                // valid; losing the user's sentence over a poisoned mutex would be the worse bug.
                tracing::warn!("the audio buffer's lock was poisoned — recovering the samples");
                std::mem::take(&mut *poisoned.into_inner())
            }
        };

        let mono = to_mono(&raw, self.channels);
        let audio = resample_to_16k(&mono, self.source_rate);

        // The level is the difference between "the microphone is not working" and "you did not
        // speak" — two failures that look identical to a user, and identical in a log that does not
        // measure them. It is a number about the *signal*, never about the content (ADR-PROJ-007).
        let captured_peak = peak_level(&audio);
        let too_quiet = captured_too_quiet(&audio);
        let audio = normalise(audio);

        tracing::info!(
            captured_samples = raw.len(),
            seconds = format!("{:.2}", audio.len() as f64 / TARGET_SAMPLE_RATE as f64),
            source_rate = self.source_rate,
            channels = self.channels,
            peak = format!("{captured_peak:.3}"),
            too_quiet,
            "recording finished"
        );

        if too_quiet {
            // Loud, because the user is about to be told the microphone was too quiet and would
            // otherwise have no way to tell a muted microphone from their own silence.
            tracing::warn!(
                peak = format!("{captured_peak:.4}"),
                "the microphone captured almost no signal — it may be muted, or the wrong device"
            );
        }

        (audio, too_quiet)
    }
}

/// Peak amplitude, 0.0..=1.0.
///
/// The peak rather than the average: speech is mostly gaps, and an RMS over a sentence with pauses
/// reads as near-silence even when every word was loud and clear.
fn peak_level(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0f32, |peak, s| peak.max(s.abs()))
}

/// Bring a quiet recording up to a level the model can work with.
///
/// **Measured, not decorative.** A recording that peaked at 0.024 — a real microphone, at a real
/// distance, with Windows' own gain — came back from whisper as "* Musik *": the model could not tell
/// speech from the noise floor. The same audio, scaled, is recognised.
///
/// Two guards keep this from becoming a noise amplifier:
///
/// * **A ceiling on the gain.** Below the silence threshold nothing is amplified at all: multiplying
///   a muted microphone's hiss by fifty produces loud hiss, and whisper hallucinates words into it.
/// * **A target below full scale.** 0.5, not 1.0 — headroom, so a single sharp consonant cannot clip.
fn normalise(mut samples: Vec<f32>) -> Vec<f32> {
    const TARGET_PEAK: f32 = 0.5;
    const MAX_GAIN: f32 = 20.0;

    let peak = peak_level(&samples);
    // Below the silence threshold there is nothing to work with; above the target it is already loud
    // enough. In either case, leaving it alone is the honest choice.
    if !(SILENCE_THRESHOLD..TARGET_PEAK).contains(&peak) {
        return samples;
    }

    let gain = (TARGET_PEAK / peak).min(MAX_GAIN);
    tracing::debug!(
        peak = format!("{peak:.3}"),
        gain = format!("{gain:.1}"),
        "the recording was quiet — levelling it before recognition"
    );

    for s in &mut samples {
        *s *= gain;
    }
    samples
}

/// Below this, there is no voice in the recording — only the noise floor of the microphone itself.
///
/// Deliberately low. It exists to tell a *muted* microphone apart from a quiet one, not to judge
/// whether someone spoke loudly enough; a whisper close to a good microphone still peaks well above
/// this.
const SILENCE_THRESHOLD: f32 = 0.01;

/// Did the microphone capture a usable signal at all? Below the noise floor there is nothing to
/// recognise — the mic is muted, set too low, or the wrong device — so the caller says exactly that to
/// the user instead of running whisper on silence and reporting a generic "nothing recognised".
fn captured_too_quiet(audio: &[f32]) -> bool {
    peak_level(audio) < SILENCE_THRESHOLD
}

fn build_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    sink: Arc<Mutex<Vec<f32>>>,
    level: SharedLevel,
    cap: usize,
) -> Result<cpal::Stream>
where
    T: cpal::SizedSample + cpal::FromSample<f32> + Send + 'static,
    f32: cpal::FromSample<T>,
{
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let Ok(mut buffer) = sink.lock() else { return };
                if buffer.len() >= cap {
                    return; // a stuck key; stop growing rather than exhaust memory
                }
                // One pass: convert, keep the sample, and track the chunk's peak for the overlay meter.
                let mut chunk_peak = 0.0f32;
                for s in data {
                    let v = cpal::Sample::to_sample::<f32>(*s);
                    chunk_peak = chunk_peak.max(v.abs());
                    buffer.push(v);
                }
                drop(buffer);
                level.observe(chunk_peak);
            },
            |e| {
                // The microphone died mid-recording (unplugged). Logged, never swallowed — the user
                // finds out because the transcript is empty and the log says why (rule:logging).
                tracing::error!(error = %e, "the microphone stream failed");
            },
            None,
        )
        .map_err(|e| AudioError::Stream(e.to_string()))
}

/// Average the channels down to one.
///
/// Whisper is mono. Taking only the first channel would throw away half the signal of a stereo
/// microphone — and on some headsets the first channel is the quiet one.
fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return samples.to_vec();
    }
    let channels = channels as usize;
    samples
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / frame.len() as f32)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mono_audio_passes_through_untouched() {
        let samples = vec![0.1, 0.2, 0.3];
        assert_eq!(to_mono(&samples, 1), samples);
    }

    #[test]
    fn stereo_is_averaged_not_halved() {
        // Taking channel 0 would give [1.0, 3.0] and silently discard the other microphone.
        let interleaved = vec![1.0, 0.0, 3.0, 1.0];
        assert_eq!(to_mono(&interleaved, 2), vec![0.5, 2.0]);
    }

    #[test]
    fn an_incomplete_final_frame_does_not_panic() {
        // A stream can end mid-frame. Losing the last sample is fine; crashing is not.
        let interleaved = vec![1.0, 0.0, 3.0];
        assert_eq!(to_mono(&interleaved, 2), vec![0.5, 3.0]);
    }

    #[test]
    fn shared_level_keeps_the_peak_and_resets_on_read() {
        let level = SharedLevel::default();
        level.observe(0.3);
        level.observe(0.7);
        level.observe(0.5); // a lower value must not lower the window's peak
        assert_eq!(level.take(), 0.7);
        // After taking, the window starts fresh.
        assert_eq!(level.take(), 0.0);
        level.observe(0.2);
        assert_eq!(level.take(), 0.2);
    }

    #[test]
    fn a_capture_below_the_noise_floor_is_flagged_too_quiet() {
        assert!(captured_too_quiet(&[0.0; 100]), "silence is too quiet");
        assert!(
            captured_too_quiet(&[0.005; 100]),
            "below the 0.01 floor is too quiet"
        );
        assert!(
            !captured_too_quiet(&[0.2; 100]),
            "a real signal is not too quiet"
        );
    }
}
