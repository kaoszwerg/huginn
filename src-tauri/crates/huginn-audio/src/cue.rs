//! The start/stop recording cues (ADR-PROJ-004: everything is configurable, including the audible
//! signal the user asked for).
//!
//! Push-to-talk gives the user no visual anchor — they are looking at the application they are
//! dictating into, not at Huginn. A short tone is often the *only* confirmation that the microphone
//! actually opened. So the cue is not decoration: a rising two-note "go" when recording starts, a
//! falling "done" when it stops, distinct enough to tell apart without looking.
//!
//! **A cue that cannot play never breaks dictation.** No output device, a busy sound card, a failed
//! stream — every one of them is logged and swallowed *here* (the one place it is safe to), because a
//! silent beep is a papercut and a lost sentence is the product failing. That is the single exception
//! to "no swallowed errors": the cue is advisory, and it says so.
//!
//! **The tone is played through the speakers, never near the open microphone.** The caller plays the
//! start cue *before* opening the microphone and the stop cue *after* closing it, so the tone can
//! never be captured and transcribed as a spurious sound (see `huginn::speech`).
//!
//! Portable on purpose: it runs on cpal's default output device, so it works on Windows now and on
//! macOS the moment recording is wired there — no platform code (rule:cross-platform).

use crate::{AudioError, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::f32::consts::PI;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Which cue to play. Rising means "recording"; falling means "stopped".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cue {
    Start,
    Stop,
}

/// The two pitches the cues are built from (D5 and A5, a clean fifth apart). Start rises through them,
/// stop falls — same notes, reversed, so the two are unmistakably different and trivially symmetric.
const LOW_HZ: f32 = 587.33;
const HIGH_HZ: f32 = 880.0;

/// Each note is short; the whole cue is under ~160 ms so it never feels like latency.
const NOTE_MS: u32 = 70;
const GAP_MS: u32 = 12;

/// Gentle. An overlay cue that startles the user is a defect, not a feature (ADR-PROJ-004).
const PEAK: f32 = 0.18;

/// Play a cue, blocking until it has finished sounding.
///
/// It blocks on purpose: the caller sequences it against the microphone (start cue before the mic
/// opens, stop cue after it closes), and that ordering only holds if the tone is done before control
/// returns. The block is ~160 ms on the dedicated push-to-talk thread — never the UI or IPC thread.
///
/// Never returns an error: a cue that will not play is logged and forgotten, because it must not be
/// able to take dictation down with it.
pub fn play(cue: Cue) {
    if let Err(e) = try_play(cue) {
        tracing::warn!(error = %e, ?cue, "the audio cue could not be played — continuing without it");
    }
}

fn try_play(cue: Cue) -> Result<()> {
    let host = cpal::default_host();
    let device = host.default_output_device().ok_or(AudioError::NoDevice)?;
    let supported = device
        .default_output_config()
        .map_err(|e| AudioError::Device(e.to_string()))?;

    let sample_rate = supported.sample_rate();
    let channels = supported.channels() as usize;
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();

    let samples = synthesize(cue, sample_rate);
    let frames = samples.len();
    let cursor = Arc::new(Mutex::new(Cursored {
        data: samples,
        pos: 0,
    }));

    let stream = match format {
        cpal::SampleFormat::F32 => build_output::<f32>(&device, config, channels, cursor),
        cpal::SampleFormat::I16 => build_output::<i16>(&device, config, channels, cursor),
        cpal::SampleFormat::U16 => build_output::<u16>(&device, config, channels, cursor),
        other => Err(AudioError::Device(format!(
            "the output device wants an unsupported sample format {other:?}"
        ))),
    }?;

    stream
        .play()
        .map_err(|e| AudioError::Stream(e.to_string()))?;

    // Wait for the tone to actually sound, then drop the stream. A small margin covers the device's
    // own buffer latency, so the last note is not cut off.
    let seconds = frames as f32 / sample_rate as f32;
    std::thread::sleep(Duration::from_secs_f32(seconds + 0.05));
    Ok(())
}

/// A mono tone and how far the output callback has read into it.
struct Cursored {
    data: Vec<f32>,
    pos: usize,
}

fn build_output<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    channels: usize,
    source: Arc<Mutex<Cursored>>,
) -> Result<cpal::Stream>
where
    T: cpal::SizedSample + cpal::FromSample<f32> + Send + 'static,
{
    device
        .build_output_stream(
            config,
            move |out: &mut [T], _| {
                let Ok(mut src) = source.lock() else {
                    // The tone is unreadable; emit silence rather than noise.
                    out.fill(T::from_sample(0.0f32));
                    return;
                };
                // The tone is mono; write the same value to every channel of each frame.
                for frame in out.chunks_mut(channels) {
                    let value = src.data.get(src.pos).copied().unwrap_or(0.0);
                    if src.pos < src.data.len() {
                        src.pos += 1;
                    }
                    let sample = T::from_sample(value);
                    for slot in frame.iter_mut() {
                        *slot = sample;
                    }
                }
            },
            |e| tracing::warn!(error = %e, "the audio cue's output stream faltered"),
            None,
        )
        .map_err(|e| AudioError::Stream(e.to_string()))
}

/// Build the cue's mono waveform: two Hann-windowed sine notes with a short gap.
///
/// The Hann envelope on each note is what keeps the cue click-free: it starts and ends every note at
/// zero amplitude, so there is no discontinuity at a note edge or at the buffer edge — a hard on/off
/// gate on a sine would pop, and a pop is exactly the harsh sound this cue must not be.
fn synthesize(cue: Cue, sample_rate: u32) -> Vec<f32> {
    let (first, second) = match cue {
        Cue::Start => (LOW_HZ, HIGH_HZ),
        Cue::Stop => (HIGH_HZ, LOW_HZ),
    };

    let note_len = (NOTE_MS as f32 / 1000.0 * sample_rate as f32) as usize;
    let gap_len = (GAP_MS as f32 / 1000.0 * sample_rate as f32) as usize;

    let mut out = Vec::with_capacity(note_len * 2 + gap_len);
    push_note(&mut out, first, note_len, sample_rate);
    out.extend(std::iter::repeat_n(0.0, gap_len));
    push_note(&mut out, second, note_len, sample_rate);
    out
}

fn push_note(out: &mut Vec<f32>, freq: f32, len: usize, sample_rate: u32) {
    if len < 2 {
        return;
    }
    for i in 0..len {
        let t = i as f32 / sample_rate as f32;
        // Hann window: 0 at both ends, 1 in the middle.
        let envelope = 0.5 - 0.5 * (2.0 * PI * i as f32 / (len - 1) as f32).cos();
        out.push(PEAK * envelope * (2.0 * PI * freq * t).sin());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 48_000;

    #[test]
    fn a_cue_has_the_expected_length() {
        let note = (NOTE_MS as f32 / 1000.0 * SR as f32) as usize;
        let gap = (GAP_MS as f32 / 1000.0 * SR as f32) as usize;
        assert_eq!(synthesize(Cue::Start, SR).len(), note * 2 + gap);
    }

    #[test]
    fn the_cue_is_audible_but_gentle() {
        let peak = synthesize(Cue::Start, SR)
            .iter()
            .fold(0.0f32, |m, s| m.max(s.abs()));
        assert!(peak > 0.05, "the cue is inaudible: peak {peak}");
        assert!(peak <= PEAK + 1e-4, "the cue is too loud: peak {peak}");
    }

    #[test]
    fn the_cue_starts_and_ends_at_silence_so_it_cannot_click() {
        // A non-zero first or last sample is a discontinuity against the surrounding silence, and a
        // discontinuity is a click — the one thing a soft cue must never produce.
        for cue in [Cue::Start, Cue::Stop] {
            let wave = synthesize(cue, SR);
            assert!(wave.first().unwrap().abs() < 1e-3, "{cue:?} clicks on");
            assert!(wave.last().unwrap().abs() < 1e-3, "{cue:?} clicks off");
        }
    }

    #[test]
    fn start_and_stop_are_distinguishable() {
        // Same notes, reversed. If they were identical the user could not tell "recording" from
        // "stopped" — which is the entire reason the cue exists.
        assert_ne!(synthesize(Cue::Start, SR), synthesize(Cue::Stop, SR));
    }

    #[test]
    fn start_rises_and_stop_falls() {
        // Compare the dominant pitch of each half by counting zero crossings: the higher note crosses
        // zero more often. Start must go low→high, stop high→low.
        let crossings = |wave: &[f32]| -> (usize, usize) {
            let mid = wave.len() / 2;
            (count_crossings(&wave[..mid]), count_crossings(&wave[mid..]))
        };
        let (s1, s2) = crossings(&synthesize(Cue::Start, SR));
        assert!(s2 > s1, "start must rise: {s1} then {s2} crossings");
        let (t1, t2) = crossings(&synthesize(Cue::Stop, SR));
        assert!(t2 < t1, "stop must fall: {t1} then {t2} crossings");
    }

    fn count_crossings(wave: &[f32]) -> usize {
        wave.windows(2)
            .filter(|w| (w[0] <= 0.0) != (w[1] <= 0.0))
            .count()
    }
}
