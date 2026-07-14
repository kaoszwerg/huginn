//! Resampling to whisper's 16 kHz.
//!
//! # Why this is not three lines
//!
//! During the engine benchmark I resampled 22 kHz audio to 16 kHz by picking the nearest sample —
//! the obvious three-liner. Whisper then transcribed "über die" as "ein Viertelbär", and the model
//! looked like the problem. It was not: nearest-sample decimation is aliasing, and it had folded the
//! high frequencies of the audio down on top of the speech.
//!
//! That mistake nearly picked the wrong model. So the resampling here is done properly:
//!
//! 1. **Low-pass first.** Anything above the new Nyquist frequency (8 kHz for a 16 kHz target) cannot
//!    be represented after downsampling and, if left in, folds back into the audible band as noise.
//!    It is removed *before* the samples are thrown away, because afterwards it is too late.
//! 2. **Then interpolate linearly** between the filtered samples.
//!
//! Speech lives well below 8 kHz, so nothing a person said is lost. What is lost is the hiss that
//! would otherwise have been mixed into their words.

use crate::TARGET_SAMPLE_RATE;

/// Resample mono audio to 16 kHz.
///
/// Audio already at 16 kHz is returned untouched — no filter, no interpolation, no rounding error.
pub fn resample_to_16k(samples: &[f32], source_rate: u32) -> Vec<f32> {
    if source_rate == TARGET_SAMPLE_RATE || samples.is_empty() {
        return samples.to_vec();
    }

    let ratio = TARGET_SAMPLE_RATE as f64 / source_rate as f64;

    // Downsampling: remove what the lower rate cannot carry, before discarding samples.
    // Upsampling (a rare 8 kHz phone-style device): no filtering is needed — nothing is thrown away.
    let filtered = if ratio < 1.0 {
        low_pass(samples, source_rate, 7_200.0)
    } else {
        samples.to_vec()
    };

    let out_len = ((samples.len() as f64) * ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);

    for i in 0..out_len {
        // Where this output sample falls between two input samples.
        let source_pos = i as f64 / ratio;
        let left = source_pos.floor() as usize;
        let frac = source_pos - left as f64;

        let a = filtered.get(left).copied().unwrap_or(0.0);
        let b = filtered.get(left + 1).copied().unwrap_or(a);
        out.push(a + (b - a) * frac as f32);
    }

    out
}

/// A second-order Butterworth low-pass, run forwards and then backwards.
///
/// **A one-pole filter is not enough, and that is measured, not assumed.** The first version here was
/// a one-pole RC filter (6 dB/octave); at the 12 kHz test tone it still passed 21 % of the amplitude
/// straight into the voice band. Butterworth at second order gives 12 dB/octave, and running it in
/// both directions doubles that to an effective fourth order — and cancels the phase shift, which a
/// speech model notices as smeared consonants.
///
/// The cutoff sits at 7.2 kHz rather than exactly at the 8 kHz Nyquist frequency: no filter is a
/// brick wall, so it needs room to roll off *before* the frequency where aliasing begins. Speech
/// carries essentially nothing above 7 kHz, so the user loses nothing they said.
fn low_pass(samples: &[f32], sample_rate: u32, cutoff_hz: f64) -> Vec<f32> {
    let coeffs = Biquad::low_pass(cutoff_hz, sample_rate as f64);

    let forward = coeffs.run(samples);

    // Backwards over the filtered signal: same filter, opposite direction. The phase shift the first
    // pass introduced is exactly undone by the second.
    let mut reversed: Vec<f32> = forward.into_iter().rev().collect();
    reversed = coeffs.run(&reversed);
    reversed.reverse();
    reversed
}

/// A second-order IIR section (biquad), in the direct form the coefficients are derived for.
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Biquad {
    /// The textbook Butterworth low-pass (RBJ cookbook), Q = 1/√2 — the value that makes the
    /// passband maximally flat, which is what "Butterworth" means.
    fn low_pass(cutoff_hz: f64, sample_rate: f64) -> Self {
        let omega = 2.0 * std::f64::consts::PI * cutoff_hz / sample_rate;
        let cos = omega.cos();
        let sin = omega.sin();
        let q = std::f64::consts::FRAC_1_SQRT_2;
        let alpha = sin / (2.0 * q);

        let a0 = 1.0 + alpha;
        Self {
            b0: (((1.0 - cos) / 2.0) / a0) as f32,
            b1: ((1.0 - cos) / a0) as f32,
            b2: (((1.0 - cos) / 2.0) / a0) as f32,
            a1: ((-2.0 * cos) / a0) as f32,
            a2: ((1.0 - alpha) / a0) as f32,
        }
    }

    fn run(&self, samples: &[f32]) -> Vec<f32> {
        let (mut x1, mut x2, mut y1, mut y2) = (0.0f32, 0.0f32, 0.0f32, 0.0f32);
        samples
            .iter()
            .map(|&x| {
                let y = self.b0 * x + self.b1 * x1 + self.b2 * x2 - self.a1 * y1 - self.a2 * y2;
                x2 = x1;
                x1 = x;
                y2 = y1;
                y1 = y;
                y
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    /// A sine wave at `freq` Hz, `seconds` long.
    fn sine(freq: f32, rate: u32, seconds: f32) -> Vec<f32> {
        let n = (rate as f32 * seconds) as usize;
        (0..n)
            .map(|i| (2.0 * PI * freq * i as f32 / rate as f32).sin())
            .collect()
    }

    /// Rough amplitude of a signal (RMS × √2).
    fn amplitude(samples: &[f32]) -> f32 {
        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        rms * std::f32::consts::SQRT_2
    }

    #[test]
    fn audio_already_at_16k_is_not_touched() {
        let input = sine(440.0, 16_000, 0.1);
        assert_eq!(resample_to_16k(&input, 16_000), input);
    }

    #[test]
    fn the_output_length_matches_the_new_rate() {
        // One second at 48 kHz becomes one second at 16 kHz.
        let input = sine(440.0, 48_000, 1.0);
        let out = resample_to_16k(&input, 48_000);
        assert!(
            (out.len() as i64 - 16_000).abs() <= 1,
            "expected ~16000 samples, got {}",
            out.len()
        );
    }

    #[test]
    fn speech_frequencies_survive_the_downsample() {
        // 1 kHz is squarely inside the voice band. If resampling damaged this, it would damage
        // everything the user says.
        let input = sine(1_000.0, 48_000, 0.5);
        let out = resample_to_16k(&input, 48_000);

        // Skip the filter's settling region at both ends.
        let body = &out[400..out.len() - 400];
        assert!(
            amplitude(body) > 0.7,
            "a 1 kHz tone lost too much amplitude: {}",
            amplitude(body)
        );
    }

    #[test]
    fn a_tone_above_the_new_nyquist_is_filtered_out_rather_than_folded_back() {
        // THE test. A 12 kHz tone cannot exist in 16 kHz audio: it folds down to 4 kHz — right into
        // the middle of the speech band — and lands in the transcript as garbage. This is the bug
        // that made "über die" come out as "ein Viertelbär".
        let input = sine(12_000.0, 48_000, 0.5);
        let out = resample_to_16k(&input, 48_000);

        let body = &out[400..out.len() - 400];
        assert!(
            amplitude(body) < 0.2,
            "a 12 kHz tone survived the resample and is now aliased into the voice band \
             (amplitude {})",
            amplitude(body)
        );
    }

    #[test]
    fn silence_stays_silent() {
        let out = resample_to_16k(&vec![0.0; 4_800], 48_000);
        assert!(out.iter().all(|s| s.abs() < 1e-6));
    }

    #[test]
    fn empty_audio_does_not_panic() {
        assert!(resample_to_16k(&[], 48_000).is_empty());
    }

    #[test]
    fn upsampling_from_a_low_rate_device_works_too() {
        // Some headsets and phone-style devices capture at 8 kHz.
        let input = sine(500.0, 8_000, 0.5);
        let out = resample_to_16k(&input, 8_000);
        assert!((out.len() as i64 - 8_000).abs() <= 1);
        assert!(amplitude(&out[200..out.len() - 200]) > 0.7);
    }
}
