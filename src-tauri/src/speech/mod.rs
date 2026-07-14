//! The speech pipeline: from the held key to the inserted text (ADR-PROJ-005).
//!
//! ```text
//!   key down  →  microphone opens          (huginn-audio)
//!   key up    →  audio → worker process    (huginn-asr-proto, over a pipe)
//!                worker → text             (huginn-asr, whisper.cpp — in ANOTHER process)
//!                text → the focused window (SendInput)
//! ```
//!
//! **The worker is a separate process, and that is the point** — not an implementation detail to be
//! optimised away later. The process that holds the microphone and synthesises keystrokes must never
//! be the one parsing a model file with C++ code. In-process inference would be faster to write and
//! is the single worst change anyone could make to this codebase (ADR-PROJ-005).
//!
//! **The recognised text passes through here exactly once**, on its way to the focused window. It is
//! never logged — not at `debug`, not in an error, not in a job label (ADR-PROJ-007).

mod worker;

pub use worker::WorkerHandle;

use crate::error::{AppError, Result};
use huginn_audio::{Cue, Recorder};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// The live speech state: the worker process, and the microphone while a key is held.
pub struct SpeechState {
    /// The worker. `None` until a model is loaded — a fresh install has no model yet.
    worker: Mutex<Option<WorkerHandle>>,
    /// The open microphone, between key-down and key-up. Not a queue: one recording at a time.
    recording: Mutex<Option<Recorder>>,
}

impl SpeechState {
    pub fn new() -> Self {
        Self {
            worker: Mutex::new(None),
            recording: Mutex::new(None),
        }
    }
}

impl Default for SpeechState {
    fn default() -> Self {
        Self::new()
    }
}

/// Start capturing. Called on key-down, from the push-to-talk worker thread.
///
/// Opening the microphone takes a few milliseconds — fast enough to do on the key, and it must be:
/// audio captured *after* the user started speaking is a word lost from the front of every sentence.
pub fn start_recording(app: &AppHandle) -> Result<()> {
    let state = app.state::<SpeechState>();

    // Check for an already-open recording *before* the cue or the microphone: an auto-repeating key
    // fires this repeatedly, and neither a stutter of beeps nor a second microphone may result.
    {
        let slot = state
            .recording
            .lock()
            .map_err(|_| AppError::Other("the recording lock is poisoned".into()))?;
        if slot.is_some() {
            tracing::debug!("already recording — ignoring");
            return Ok(());
        }
    }

    let settings = app.state::<crate::state::AppState>().settings.get();

    // The start cue plays **before** the microphone opens, so its tone can never bleed into the
    // recording and be transcribed as a spurious sound. It is the user's "go" — with push-to-talk
    // there is nothing on screen to say the microphone is live (ADR-PROJ-004).
    if settings.sounds {
        huginn_audio::cue::play(Cue::Start);
    }

    let recorder = Recorder::start(settings.microphone.as_deref())
        .map_err(|e| AppError::Other(format!("the microphone could not be opened: {e}")))?;

    let mut slot = state
        .recording
        .lock()
        .map_err(|_| AppError::Other("the recording lock is poisoned".into()))?;

    // A second press may have slipped in during the cue; if so, this microphone is the extra one and
    // is dropped here rather than replacing the live recording.
    if slot.is_some() {
        tracing::debug!("already recording — discarding the extra microphone");
        return Ok(());
    }
    *slot = Some(recorder);
    Ok(())
}

/// Stop capturing and recognise. Called on key-up.
///
/// Returns the processed text ready to insert — the recognised words run through `huginn-text` (spoken
/// commands, macros, a trailing space), together with where the caret should land — or `None` when
/// there was nothing to recognise (the key was tapped rather than held). **The text is returned,
/// never logged** (ADR-PROJ-007).
pub fn finish_recording(app: &AppHandle) -> Result<Option<huginn_text::Processed>> {
    let state = app.state::<SpeechState>();

    let recorder = {
        let mut slot = state
            .recording
            .lock()
            .map_err(|_| AppError::Other("the recording lock is poisoned".into()))?;
        slot.take()
    };

    let Some(recorder) = recorder else {
        tracing::debug!("key released without an open recording");
        return Ok(None);
    };

    // Stops the microphone and hands back 16 kHz mono — resampled properly, low-passed first.
    let audio = recorder.finish();

    let settings = app.state::<crate::state::AppState>().settings.get();

    // The stop cue plays **after** the microphone has closed (above): immediate confirmation that the
    // key registered, while whisper does the slower work of turning the audio into text. It cannot be
    // captured, because there is no longer an open microphone to capture it.
    if settings.sounds {
        huginn_audio::cue::play(Cue::Stop);
    }

    let language = settings.recognition_language.clone();

    let transcript = {
        let mut worker = state
            .worker
            .lock()
            .map_err(|_| AppError::Other("the worker lock is poisoned".into()))?;

        let Some(worker) = worker.as_mut() else {
            return Err(AppError::Other(
                "no speech model is loaded — install one in the settings".into(),
            ));
        };

        worker.transcribe(&audio, Some(&language))?
    };

    // Counts and durations. NEVER the text (ADR-PROJ-007).
    tracing::info!(
        chars = transcript.chars().count(),
        "text recognised and about to be inserted"
    );

    // Post-process into the text actually inserted: spoken commands, macros, spacing (`huginn-text`,
    // ADR-PROJ-010). Applied here, the one place both platforms funnel through, so neither injection
    // path can forget it.
    let user_rules: Vec<huginn_text::Rule> = settings.rules.iter().map(|r| r.to_rule()).collect();
    let options = huginn_text::Options {
        dictate_punctuation: settings.dictate_punctuation,
    };
    let ctx = build_context(&settings.rules, &language);
    Ok(Some(huginn_text::process(
        &transcript,
        &language,
        &user_rules,
        &options,
        &ctx,
    )))
}

/// Resolve the runtime values a macro template might need — the clock, and the clipboard **only if a
/// rule actually uses it**. Reading the clipboard on every dictation would be needless, and needlessly
/// touching the user's clipboard (rule:privacy); so it is read lazily, and never logged (ADR-PROJ-007).
fn build_context(rules: &[crate::dto::VoiceRuleDto], language: &str) -> huginn_text::Context {
    use chrono::Datelike;
    let now = chrono::Local::now();
    let base = language.split('-').next().unwrap_or("").to_lowercase();
    let date = match base.as_str() {
        "de" => now.format("%d.%m.%Y").to_string(),
        "en" => now.format("%m/%d/%Y").to_string(),
        _ => now.format("%Y-%m-%d").to_string(),
    };
    let time = now.format("%H:%M").to_string();
    let weekday = weekday_name(now.weekday(), &base);

    let clipboard = if uses_clipboard(rules) {
        read_clipboard()
    } else {
        String::new()
    };

    huginn_text::Context {
        date,
        time,
        weekday,
        clipboard,
    }
}

/// The weekday's name in the recognition language. `chrono`'s own `%A` is English-only, so the handful
/// of names is mapped here rather than pulling in a localisation crate for seven words.
fn weekday_name(day: chrono::Weekday, base: &str) -> String {
    use chrono::Weekday::*;
    let (de, en) = match day {
        Mon => ("Montag", "Monday"),
        Tue => ("Dienstag", "Tuesday"),
        Wed => ("Mittwoch", "Wednesday"),
        Thu => ("Donnerstag", "Thursday"),
        Fri => ("Freitag", "Friday"),
        Sat => ("Samstag", "Saturday"),
        Sun => ("Sonntag", "Sunday"),
    };
    if base == "de" { de } else { en }.to_string()
}

/// Does any enabled rule's template reference `{clipboard}`? Only then is it worth reading.
fn uses_clipboard(rules: &[crate::dto::VoiceRuleDto]) -> bool {
    use crate::dto::VoiceActionDto;
    rules.iter().any(|r| {
        r.enabled && matches!(&r.action, VoiceActionDto::Insert(t) if t.contains("{clipboard}"))
    })
}

/// The clipboard text, for a `{clipboard}` macro. Windows now; macOS is written on the Mac (phase 1b).
fn read_clipboard() -> String {
    #[cfg(target_os = "windows")]
    {
        crate::pushtotalk::win32::clipboard::read_text().unwrap_or_default()
    }
    #[cfg(not(target_os = "windows"))]
    {
        String::new()
    }
}

/// Load a model into the worker, starting the worker if it is not running.
///
/// Slow (the model is hundreds of megabytes), so it is a Job (ADR-PROJ-008) and it happens off the
/// keypress path — at startup, and whenever the user picks a different model.
pub fn load_model(app: &AppHandle, model_path: &std::path::Path) -> Result<()> {
    let state = app.state::<SpeechState>();
    let mut slot = state
        .worker
        .lock()
        .map_err(|_| AppError::Other("the worker lock is poisoned".into()))?;

    // A worker already running with another model is replaced: two whisper contexts would hold two
    // models in memory, and the old one is now dead weight.
    if let Some(old) = slot.take() {
        old.shutdown();
    }

    let mut worker = WorkerHandle::spawn(app)?;
    worker.load_model(model_path)?;
    *slot = Some(worker);

    Ok(())
}

/// The current microphone input level while recording, `0.0..=1.0`, or `None` when nothing is being
/// recorded. Polled ~20×/s by the overlay's level pump so the user can see their voice arriving
/// (ADR-PROJ-004). Reading it resets the level's window (see [`huginn_audio::Recorder::level`]).
pub fn recording_level(app: &AppHandle) -> Option<f32> {
    let state = app.state::<SpeechState>();
    let slot = state.recording.lock().ok()?;
    slot.as_ref().map(|recorder| recorder.level())
}

/// Is a model loaded and ready to transcribe?
pub fn is_ready(app: &AppHandle) -> bool {
    app.state::<SpeechState>()
        .worker
        .lock()
        .map(|w| w.is_some())
        .unwrap_or(false)
}
