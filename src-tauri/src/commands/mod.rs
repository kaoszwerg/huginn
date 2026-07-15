//! Tauri command surface (typed via ts-rs DTOs). Thin layer: validate, do the work, map errors
//! (ADR-APP-001, rule:rust-conventions). Every command logs its action and its result (rule:logging).

use crate::dto::{BuildInfo, CrashReport, HotkeyStatus, SettingsDto, ThemeChoice};
use crate::error::{AppError, Result};
use crate::settings::SettingsPatch;
use crate::state::AppState;
use tauri::{Manager, State};

/// Record a fatal error from the UI runtime (ADR-CORE-037, ADR-APP-032).
///
/// The webview is a **second entry point**: the Rust panic hook is blind to it, so a crash in the UI
/// would otherwise leave the user with a blank window and us with nothing to debug. This turns it into
/// the same durable, on-device record a Rust panic produces. Returns the report's path so the fatal
/// screen can tell the user where it is; fails only if the report could not be written.
#[tauri::command]
pub fn report_crash(report: CrashReport) -> Result<String> {
    tracing::error!(source = %report.source, message = %report.message, "frontend crash");
    let details = format!(
        "source:  {}\nmessage: {}\n\nstack:\n{}",
        report.source,
        report.message,
        report.stack.as_deref().unwrap_or("<none>")
    );
    let path = crate::crash::write_report("ui", &details).ok_or_else(|| {
        AppError::Other("the crash report could not be written to disk".to_string())
    })?;
    tracing::info!(path = %path.display(), "frontend crash recorded");
    Ok(path.to_string_lossy().into_owned())
}

/// The crash report left behind by a previous failure, if there is one. Consumed on read.
///
/// The backstop for the native message box: when the app dies so early that no dialog can be shown — or
/// the platform has none — the user still learns about it the next time they open the app.
#[tauri::command]
pub fn pending_crash() -> Option<String> {
    let pending = crate::crash::take_pending();
    match &pending {
        Some(path) => tracing::warn!(path = %path.display(), "a previous run left a crash report"),
        None => tracing::debug!("no pending crash from a previous run"),
    }
    pending.map(|p| p.to_string_lossy().into_owned())
}

/// End the process after a fatal UI error, with the exit code that says so (`EXIT_UI_CRASH`).
///
/// Invoked from the fatal screen's "Quit" button. The log file is flushed first: `app.exit` runs no
/// destructors either, and the records describing the crash are the ones that matter most.
#[tauri::command]
pub fn exit_after_crash(app: tauri::AppHandle) {
    tracing::error!("exiting after a fatal UI error");
    crate::logging::flush();
    app.exit(crate::crash::EXIT_UI_CRASH);
}

/// App version from Cargo metadata (IPC smoke test).
#[tauri::command]
pub fn app_version() -> String {
    tracing::debug!("app_version");
    env!("CARGO_PKG_VERSION").to_string()
}

/// Build identity (version + channel + commit) — see [`BuildInfo`].
#[tauri::command]
pub fn build_info() -> BuildInfo {
    let info = BuildInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        channel: if cfg!(debug_assertions) {
            "dev"
        } else {
            "release"
        }
        .to_string(),
        debug: cfg!(debug_assertions),
        git_sha: env!("GIT_SHA").to_string(),
        git_dirty: env!("GIT_DIRTY") == "true",
        commit_date: env!("BUILD_COMMIT_DATE").to_string(),
    };
    tracing::debug!(version = %info.version, channel = %info.channel, "build_info");
    info
}

/// Recent log records (ring buffer) for the log view's initial load.
#[tauri::command]
pub fn get_recent_logs() -> Vec<crate::logging::LogRecord> {
    let records = crate::logging::recent();
    tracing::debug!(count = records.len(), "get_recent_logs");
    records
}

/// Read the persisted user settings.
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> SettingsDto {
    let settings = state.settings.get();
    tracing::debug!(
        ui_scale = settings.ui_scale,
        minimize_to_tray = settings.minimize_to_tray,
        "get_settings"
    );
    settings
}

/// Update the persisted user settings. Omitted fields keep their current value. Toggling
/// `minimize_to_tray` installs/removes the tray icon immediately (no restart).
///
/// The push-to-talk hotkey is deliberately **not** settable here: changing it can fail (the OS may
/// refuse the combination), and a partial update that half-succeeded is worse than a command that
/// owns the whole operation — see [`set_hotkey`].
#[tauri::command]
pub fn update_settings(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    ui_scale: Option<f64>,
    minimize_to_tray: Option<bool>,
    theme: Option<ThemeChoice>,
    language: Option<String>,
) -> Result<SettingsDto> {
    tracing::info!(
        ?ui_scale,
        ?minimize_to_tray,
        ?theme,
        ?language,
        "update_settings"
    );
    let _ = &app; // the tray is installed unconditionally now; nothing here toggles it.
    let next = state.settings.update(SettingsPatch {
        ui_scale,
        minimize_to_tray,
        theme,
        language,
        // These have their own commands: choosing a microphone or a model does more than write a
        // field — see set_microphone / set_model / set_sounds below.
        microphone: None,
        model: None,
        recognition_language: None,
        sounds: None,
        hotkey: None,
        rules: None,
        dictate_punctuation: None,
        streaming: None,
        stream_sensitivity: None,
    })?;
    tracing::debug!(
        ui_scale = next.ui_scale,
        minimize_to_tray = next.minimize_to_tray,
        theme = ?next.theme,
        "update_settings ok"
    );
    Ok(next)
}

/// Is push-to-talk actually armed? Asked by the UI on load, so the window can say so on sight
/// instead of leaving the user to discover a dead key (rule:overlay-and-input).
#[tauri::command]
pub fn get_hotkey_status(app: tauri::AppHandle) -> HotkeyStatus {
    let status = crate::pushtotalk::status(&app);
    tracing::debug!(
        shortcut = %status.shortcut,
        registered = status.registered,
        "get_hotkey_status"
    );
    status
}

/// Change the push-to-talk hotkey and try to register it with the OS.
///
/// Returns the resulting [`HotkeyStatus`] — including the failure case. "That combination is
/// already taken" is a state the user must see and act on, not an exception: an `Err` here would
/// make the UI show a red toast and forget, when what it must do is *keep showing* that the key is
/// dead until it is fixed.
#[tauri::command]
pub fn set_hotkey(app: tauri::AppHandle, shortcut: String) -> Result<HotkeyStatus> {
    // Validate at the boundary: the webview is treated as hostile even though we wrote it
    // (ADR-CORE-011). A shortcut is a short string; anything longer is not one.
    let spec = shortcut.trim();
    if spec.is_empty() || spec.len() > 64 {
        return Err(AppError::Other(format!(
            "not a plausible shortcut ({} chars)",
            spec.len()
        )));
    }
    crate::pushtotalk::set_hotkey(&app, spec)
}

/// Whether Huginn starts with the desktop.
///
/// **The operating system is the source of truth**, not a field in our settings file. A copy would
/// drift the moment the user removes the entry themselves (Task Manager on Windows, System Settings
/// on macOS) and Huginn would then confidently show a switch that is a lie.
#[tauri::command]
pub fn get_autostart(app: tauri::AppHandle) -> Result<bool> {
    use tauri_plugin_autostart::ManagerExt;

    let enabled = app
        .autolaunch()
        .is_enabled()
        .map_err(|e| AppError::Other(format!("cannot read the autostart state: {e}")))?;
    tracing::debug!(enabled, "get_autostart");
    Ok(enabled)
}

/// Turn autostart on or off, and report what the OS actually did.
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<bool> {
    use tauri_plugin_autostart::ManagerExt;

    tracing::info!(enabled, "set_autostart");
    let manager = app.autolaunch();

    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| {
        AppError::Other(format!(
            "the system refused to {} autostart: {e}",
            if enabled { "enable" } else { "disable" }
        ))
    })?;

    // Read it back rather than assuming it took: the switch must show what *is*, not what we asked
    // for (ADR-CORE-004).
    let now = manager
        .is_enabled()
        .map_err(|e| AppError::Other(format!("cannot confirm the autostart state: {e}")))?;
    tracing::info!(enabled = now, "autostart updated");
    Ok(now)
}

/// Every microphone the system offers, with the default marked.
///
/// Read fresh each time rather than cached: a headset plugged in after the app started must appear,
/// and one that was unplugged must not linger in the list as a choice that will silently fail.
#[tauri::command]
pub fn list_microphones() -> Result<Vec<huginn_audio::AudioDevice>> {
    let devices = huginn_audio::input_devices()
        .map_err(|e| AppError::Other(format!("the microphones could not be listed: {e}")))?;
    tracing::debug!(count = devices.len(), "list_microphones");
    Ok(devices)
}

/// Choose the microphone. `None` means the system default.
#[tauri::command]
pub fn set_microphone(state: State<'_, AppState>, name: Option<String>) -> Result<SettingsDto> {
    tracing::info!(?name, "set_microphone");
    state.settings.update(SettingsPatch {
        microphone: Some(name),
        ..Default::default()
    })
}

/// Turn the start/stop sounds on or off.
#[tauri::command]
pub fn set_sounds(state: State<'_, AppState>, enabled: bool) -> Result<SettingsDto> {
    tracing::info!(enabled, "set_sounds");
    state.settings.update(SettingsPatch {
        sounds: Some(enabled),
        ..Default::default()
    })
}

/// Replace the full voice-command list (ADR-PROJ-010). The editor owns the list and sends it whole.
///
/// The rule *content* (phrases, macro text) is the user's own and is **not logged** — only the count
/// (ADR-PROJ-007).
#[tauri::command]
pub fn set_rules(
    state: State<'_, AppState>,
    rules: Vec<crate::dto::VoiceRuleDto>,
) -> Result<SettingsDto> {
    tracing::info!(count = rules.len(), "set_rules");
    state.settings.update(SettingsPatch {
        rules: Some(rules),
        ..Default::default()
    })
}

/// Turn spoken punctuation ("Komma" → ",") on or off (off by default — it steals the literal word).
#[tauri::command]
pub fn set_dictate_punctuation(state: State<'_, AppState>, enabled: bool) -> Result<SettingsDto> {
    tracing::info!(enabled, "set_dictate_punctuation");
    state.settings.update(SettingsPatch {
        dictate_punctuation: Some(enabled),
        ..Default::default()
    })
}

/// Turn streaming transcription on or off (ADR-PROJ-011). Off falls back to batch — the whole recording
/// is transcribed on key-release, as before. Takes effect on the next recording.
#[tauri::command]
pub fn set_streaming(state: State<'_, AppState>, enabled: bool) -> Result<SettingsDto> {
    tracing::info!(enabled, "set_streaming");
    state.settings.update(SettingsPatch {
        streaming: Some(enabled),
        ..Default::default()
    })
}

/// Set how readily the streamer cuts a segment at a pause, `0.0..=1.0` (ADR-PROJ-011). Clamped on apply;
/// higher cuts on smaller/quieter pauses. The environment-dependent knob (microphone, room noise).
#[tauri::command]
pub fn set_stream_sensitivity(state: State<'_, AppState>, sensitivity: f64) -> Result<SettingsDto> {
    tracing::info!(sensitivity, "set_stream_sensitivity");
    state.settings.update(SettingsPatch {
        stream_sensitivity: Some(sensitivity),
        ..Default::default()
    })
}

/// The built-in voice commands for the current recognition language, for the in-app reference.
///
/// SSOT with the engine (ADR-PROJ-010): the settings show exactly the phrases `huginn-text` acts on.
#[tauri::command]
pub fn list_builtin_commands(
    state: State<'_, AppState>,
) -> Result<Vec<crate::dto::BuiltinCommandDto>> {
    let language = state.settings.get().recognition_language;
    Ok(huginn_text::builtin_reference(&language)
        .into_iter()
        .map(Into::into)
        .collect())
}

/// The model catalogue, annotated with what is actually installed.
#[tauri::command]
pub fn list_models(app: tauri::AppHandle) -> Result<Vec<huginn_models::ModelStatus>> {
    let dir = crate::models_dir(&app)?;
    Ok(huginn_models::installed(&dir))
}

/// Download a model and verify it (ADR-PROJ-006).
///
/// **The only outbound connection in the product**, and it happens only because the user clicked.
/// Runs as a Job: progress in bytes, an honest ETA, and a cancel that stops the download rather than
/// hiding the row (ADR-PROJ-008).
#[tauri::command]
pub async fn download_model(app: tauri::AppHandle, id: String) -> Result<()> {
    let dir = crate::models_dir(&app)?;
    let jobs = app.state::<crate::state::AppState>().jobs.clone();

    // The download blocks for minutes; it does not run on the IPC thread (rule:jobs).
    tauri::async_runtime::spawn_blocking(move || {
        huginn_models::download_and_verify(&dir, &id, &jobs)
    })
    .await
    .map_err(|e| AppError::Other(format!("the download task failed: {e}")))?
    .map_err(|e| AppError::Other(e.to_string()))?;

    Ok(())
}

/// List a directory for the in-app file picker (ADR-APP-026 — the OS file dialog is a native control we
/// do not use; the picker is built from our own primitives and this command feeds it).
///
/// `path` empty/`None` starts at the user's home directory. **Read-only**: it returns entry names and
/// whether each is a directory — never file contents. The file the user finally picks is validated when
/// it is imported (`import_model`), not here.
#[tauri::command]
pub fn list_directory(
    app: tauri::AppHandle,
    path: Option<String>,
) -> Result<crate::dto::DirListingDto> {
    let dir = match path.filter(|p| !p.trim().is_empty()) {
        Some(p) => std::path::PathBuf::from(p),
        None => app
            .path()
            .home_dir()
            .map_err(|e| AppError::Other(format!("cannot resolve the home directory: {e}")))?,
    };

    read_listing(&dir)
}

/// Read a directory into a [`DirListingDto`]: directories first, then files, each alphabetical
/// (case-insensitive). **Read-only** — it collects each entry's name and whether it is a directory,
/// never any file's contents.
///
/// Split out from the [`list_directory`] command so the read-and-sort behaviour can be tested against a
/// temporary directory without an `AppHandle` (rule:testing). An unreadable directory is an `Err`, not
/// an empty listing — a silent empty result would read as "this folder is empty" (rule:logging).
fn read_listing(dir: &std::path::Path) -> Result<crate::dto::DirListingDto> {
    use crate::dto::{DirEntryDto, DirListingDto};

    let read = std::fs::read_dir(dir)
        .map_err(|e| AppError::Other(format!("cannot read {}: {e}", dir.display())))?;

    let mut entries: Vec<DirEntryDto> = read
        .flatten()
        .map(|entry| {
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            DirEntryDto {
                name: entry.file_name().to_string_lossy().to_string(),
                path: entry.path().to_string_lossy().to_string(),
                is_dir,
            }
        })
        .collect();

    // Directories first, then files, each alphabetical (case-insensitive).
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    tracing::debug!(dir = %dir.display(), count = entries.len(), "list_directory");
    Ok(DirListingDto {
        parent: dir.parent().map(|p| p.to_string_lossy().to_string()),
        path: dir.to_string_lossy().to_string(),
        entries,
    })
}

/// Import a model file the user chose from disk (ADR-PROJ-006).
///
/// It is **not verified** — there is no compiled-in hash for a file we have never seen — and it is never
/// labelled verified (the UI says so). `path` comes from the file dialog and is treated as hostile: it
/// is validated in `huginn_models::import_model` (a real file, a sane size) before a byte is copied
/// (ADR-CORE-011). The copy is a Job and runs off the IPC thread (rule:jobs). The file is parsed only
/// later, in the deprivileged worker (ADR-PROJ-005). Returns the new model's id.
#[tauri::command]
pub async fn import_model(app: tauri::AppHandle, path: String) -> Result<String> {
    let dir = crate::models_dir(&app)?;
    let jobs = app.state::<crate::state::AppState>().jobs.clone();
    let source = std::path::PathBuf::from(path);
    tracing::info!(source = %source.display(), "import_model");

    tauri::async_runtime::spawn_blocking(move || huginn_models::import_model(&dir, &source, &jobs))
        .await
        .map_err(|e| AppError::Other(format!("the import task failed: {e}")))?
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Choose the model that recognises the speech, and load it into the worker.
///
/// The model must be installed — the UI only offers installed ones, but the boundary is validated
/// anyway (ADR-CORE-011: the webview is treated as hostile even though we wrote it).
#[tauri::command]
pub async fn set_model(app: tauri::AppHandle, id: String) -> Result<SettingsDto> {
    tracing::info!(model = %id, "set_model");

    let dir = crate::models_dir(&app)?;
    let path = huginn_models::model_path(&dir, &id);
    if !path.is_file() {
        return Err(AppError::Other(format!(
            "the model “{id}” is not installed"
        )));
    }

    let settings = {
        let state = app.state::<AppState>();
        state.settings.update(SettingsPatch {
            model: Some(id),
            ..Default::default()
        })?
    };

    // Loading takes hundreds of milliseconds and allocates the whole model — off the IPC thread.
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::speech::load_model(&handle, &path))
        .await
        .map_err(|e| AppError::Other(format!("the model load task failed: {e}")))??;

    Ok(settings)
}

/// Every job the backend is running — what the process monitor shows (ADR-PROJ-008).
#[tauri::command]
pub fn list_jobs(state: State<'_, AppState>) -> Vec<huginn_core::Job> {
    state.jobs.snapshot()
}

/// Ask a job to stop. The work actually stops; the row is not merely hidden (rule:jobs).
#[tauri::command]
pub fn cancel_job(state: State<'_, AppState>, id: u64) {
    tracing::info!(job = id, "cancel_job");
    state.jobs.cancel(id);
}

/// Open an external URL in the user's default browser. Routed through the backend so any failure
/// surfaces in our own log and on an explicit IPC error path.
///
/// Windows: drive `ShellExecuteW("open", url)` directly. The cross-platform `open` crate falls back
/// to `cmd /c start <url>`, which silently exits from a windows-subsystem binary (no console
/// attached) before the default browser handler can pick up the URL.
///
/// Other targets: the `open` crate, which uses the OS-appropriate handler (`xdg-open`, `open`).
#[tauri::command]
pub fn open_external(url: String) -> Result<()> {
    tracing::info!(%url, "open_external");
    // Whitelist: only http(s) URLs are permitted from the IPC boundary (ADR-CORE-011 path-safety).
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(AppError::Other(format!(
            "refusing to open non-http url: {url}"
        )));
    }
    open_default_handler(&url)?;
    tracing::info!(%url, "open_external dispatched");
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_default_handler(url: &str) -> Result<()> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let verb: Vec<u16> = OsStr::new("open").encode_wide().chain([0]).collect();
    let target: Vec<u16> = OsStr::new(url).encode_wide().chain([0]).collect();

    let h = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(verb.as_ptr()),
            PCWSTR(target.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if (h.0 as isize) > 32 {
        Ok(())
    } else {
        Err(AppError::Other(format!(
            "ShellExecuteW failed for {url} (code {})",
            h.0 as isize
        )))
    }
}

#[cfg(not(target_os = "windows"))]
fn open_default_handler(url: &str) -> Result<()> {
    ::open::that_detached(url).map_err(|e| AppError::Other(format!("open {url}: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_info_reports_version_and_channel() {
        let info = build_info();
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(
            info.channel,
            if cfg!(debug_assertions) {
                "dev"
            } else {
                "release"
            }
        );
        assert_eq!(info.debug, cfg!(debug_assertions));
    }

    #[test]
    fn open_external_rejects_non_http_urls() {
        let err = open_external("file:///etc/passwd".to_string()).expect_err("must be rejected");
        assert!(err.to_string().contains("refusing to open non-http url"));
    }

    #[test]
    fn read_listing_sorts_directories_first_then_files_alphabetically() {
        use std::fs;
        let tmp = tempfile::tempdir().expect("temp dir");
        let root = tmp.path();
        // Deliberately out of order and mixed-case, so the sort is actually exercised.
        fs::create_dir(root.join("Zeta")).unwrap();
        fs::create_dir(root.join("alpha")).unwrap();
        fs::write(root.join("b.bin"), b"x").unwrap();
        fs::write(root.join("A.txt"), b"x").unwrap();

        let listing = read_listing(root).expect("listing");
        let names: Vec<&str> = listing.entries.iter().map(|e| e.name.as_str()).collect();
        // Directories first (case-insensitive alpha), then files (case-insensitive alpha).
        assert_eq!(names, ["alpha", "Zeta", "A.txt", "b.bin"]);
        assert!(listing.entries[0].is_dir, "a directory reports is_dir");
        assert!(!listing.entries[2].is_dir, "a file does not");
        assert_eq!(
            listing.parent,
            root.parent().map(|p| p.to_string_lossy().to_string()),
            "the parent is offered so the picker can step back up"
        );
    }

    #[test]
    fn read_listing_errors_on_a_missing_directory() {
        let tmp = tempfile::tempdir().expect("temp dir");
        let missing = tmp.path().join("does-not-exist");
        // Not an empty listing — an unreadable path is surfaced as an error (rule:logging).
        assert!(read_listing(&missing).is_err());
    }
}
