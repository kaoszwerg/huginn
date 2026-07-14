//! The backend's last line: no entry point dies silently (ADR-CORE-037, ADR-APP-032).
//!
//! `rule:logging` governs the error a component *caught*. This module governs the one nobody caught —
//! the panic that reaches the top of the stack, and the startup failure that happens before there is a
//! window to show anything in. On a `windows_subsystem = "windows"` binary (see `main.rs`) there is no
//! console attached, so stderr goes nowhere: without this module a release build simply vanishes.
//!
//! Every path here **reports and terminates**. Nothing is suppressed, nothing resumes.
//!
//! Three things happen before the process goes down:
//!
//! 1. the failure is logged through `tracing` (rule:logging);
//! 2. a **crash report** is written **synchronously** to `<app_data_dir>/crashes/`, and a `pending`
//!    marker is left next to it, so the next launch can tell the user what happened;
//! 3. the user is shown a native message box — one that does **not** need Tauri's event loop, because
//!    by this point the event loop may be exactly what is broken.
//!
//! Then: a deliberate, non-zero exit code.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

/// A panic anywhere in the backend. The state is suspect, so the process ends (rule:crash-handling).
pub const EXIT_PANIC: i32 = 101;
/// The app could not start: `setup()` or the Tauri builder failed. There is no window to report into.
pub const EXIT_STARTUP: i32 = 102;
/// The UI runtime hit a fatal error and the user chose to quit from the fatal screen.
pub const EXIT_UI_CRASH: i32 = 103;

/// Name of the marker that survives the crash and is read by the NEXT launch.
const PENDING: &str = "pending";

static CRASH_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Guards against a panic *inside* the crash path recursing forever (a failing writer, a panicking
/// formatter). The second time through, we stop trying to be helpful and just die.
static CRASHING: AtomicBool = AtomicBool::new(false);

/// Point the crash path at the real app data dir. Called from `setup()` as soon as Tauri resolves it.
///
/// Until this runs, reports land in the temp dir (see [`crash_dir`]) — deliberately: the panic hook is
/// installed *before* Tauri starts, precisely so that a failure during startup still leaves a record.
pub fn set_data_dir(data_dir: &Path) {
    let _ = CRASH_DIR.set(data_dir.join("crashes"));
}

/// Where reports go. Falls back to the OS temp dir while the app data dir is still unknown.
fn crash_dir() -> PathBuf {
    CRASH_DIR
        .get()
        .cloned()
        .unwrap_or_else(|| std::env::temp_dir().join(concat!(env!("CARGO_PKG_NAME"), "-crashes")))
}

/// Compose the report body. Kept separate from the IO so it can be asserted on in a test.
fn compose(kind: &str, details: &str) -> String {
    format!(
        "{name} crash report\n\
         version: {version} ({channel}, commit {sha})\n\
         when:    {when}\n\
         kind:    {kind}\n\
         \n\
         {details}\n",
        name = env!("CARGO_PKG_NAME"),
        version = env!("CARGO_PKG_VERSION"),
        channel = if cfg!(debug_assertions) {
            "dev"
        } else {
            "release"
        },
        sha = env!("GIT_SHA"),
        when = chrono::Utc::now().to_rfc3339(),
        kind = kind,
        details = details,
    )
}

/// Write a report into `dir` and drop the `pending` marker beside it. Returns the report's path.
///
/// Written with plain synchronous `std::fs`, NOT through the tracing file layer, and that is the whole
/// point: the log file is served by `tracing_appender`'s non-blocking background worker, which flushes
/// on `Drop` — and a deliberate `process::exit` runs no destructors. The record that matters most is
/// therefore the one most likely to be lost. This one cannot be.
fn write_report_in(dir: &Path, kind: &str, details: &str) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S%.3f");
    let path = dir.join(format!("crash-{stamp}-{kind}.log"));
    std::fs::write(&path, compose(kind, details))?;
    // Best-effort: a missing marker costs the next launch its notice, not the report itself.
    let _ = std::fs::write(dir.join(PENDING), path.to_string_lossy().as_bytes());
    Ok(path)
}

/// Write a crash report. Never panics and never propagates: this runs on a path that is already fatal,
/// and a failure to record must not become a second crash. A write failure is logged and returns `None`.
pub fn write_report(kind: &str, details: &str) -> Option<PathBuf> {
    match write_report_in(&crash_dir(), kind, details) {
        Ok(path) => Some(path),
        Err(e) => {
            tracing::error!(error = %e, dir = %crash_dir().display(), "could not write crash report");
            None
        }
    }
}

/// Read and clear the marker left by a crash in a PREVIOUS run, if the report it names still exists.
fn take_pending_in(dir: &Path) -> Option<PathBuf> {
    let marker = dir.join(PENDING);
    let raw = std::fs::read_to_string(&marker).ok()?;
    // Clear it first: a marker we cannot clear would nag the user on every launch, forever.
    let _ = std::fs::remove_file(&marker);
    let path = PathBuf::from(raw.trim());
    path.is_file().then_some(path)
}

/// The last run's crash report, if it crashed. Consumed once — the notice is shown, not repeated.
///
/// This is the backstop for the message box: if the app dies so early (or so hard) that no dialog can
/// be shown, the user still learns about it the next time they open the app.
pub fn take_pending() -> Option<PathBuf> {
    take_pending_in(&crash_dir())
}

/// Tell the user, with a dialog that does not depend on Tauri's event loop.
///
/// Deliberately NOT `tauri-plugin-dialog`: its `blocking_show()` is documented as unsafe to call from
/// the main thread, and a panic hook runs on whatever thread panicked — including the main one. Worse,
/// a startup failure leaves no `AppHandle` at all. Both cases need a dialog that stands on its own:
///
/// - Windows: `MessageBoxW` — its own modal message loop, callable from any thread.
/// - macOS / Linux: a subprocess (`osascript` / `zenity`), which cannot deadlock us at all.
///
/// Best-effort by design: if no dialog can be shown (a headless Linux box, no `zenity`), the crash
/// report and the log are still on disk, and the next launch still shows the notice.
///
/// `NO_CRASH_DIALOG` suppresses **only the dialog** — for an automated test (a modal box would block the
/// run forever) or a headless machine. It is announced in the log, never silent, and it suppresses
/// nothing else: the log line, the crash report and the exit code all still happen. It is not a way to
/// switch the crash reporting off, and there isn't one.
fn notify_user(summary: &str, report: Option<&Path>) {
    if std::env::var_os("NO_CRASH_DIALOG").is_some() {
        tracing::warn!(
            "NO_CRASH_DIALOG is set — the crash dialog is suppressed (the report is not)"
        );
        return;
    }
    let detail = match report {
        Some(p) => format!("A crash report was saved to:\n{}", p.display()),
        None => "No crash report could be written; see the application log.".to_string(),
    };
    let body = format!("{summary}\n\n{detail}");
    let title = concat!(env!("CARGO_PKG_NAME"), " — fatal error");
    show_message_box(title, &body);
}

#[cfg(target_os = "windows")]
fn show_message_box(title: &str, body: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let wide = |s: &str| -> Vec<u16> { OsStr::new(s).encode_wide().chain([0]).collect() };
    let (title, body) = (wide(title), wide(body));
    // SAFETY: both buffers are NUL-terminated and outlive the call. MessageBoxW runs its own modal
    // message loop, so it needs neither our event loop nor the main thread.
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(body.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(target_os = "macos")]
fn show_message_box(title: &str, body: &str) {
    // AppleScript string literals escape only `\` and `"`.
    let esc = |s: &str| s.replace('\\', r"\\").replace('"', r#"\""#);
    let script = format!(
        r#"display alert "{}" message "{}" as critical"#,
        esc(title),
        esc(body)
    );
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status();
}

#[cfg(all(unix, not(target_os = "macos")))]
fn show_message_box(title: &str, body: &str) {
    // zenity is present on most desktops but is not guaranteed; kdialog is the common alternative.
    // Arguments are passed as a vector (no shell), so the text cannot be injected into a command line.
    let zenity = std::process::Command::new("zenity")
        .args(["--error", "--title", title, "--text", body])
        .status();
    if zenity.is_err() {
        let _ = std::process::Command::new("kdialog")
            .args(["--error", body, "--title", title])
            .status();
    }
}

/// Report a fatal condition and END THE PROCESS. Never returns.
///
/// This is the one exit used by every fatal path, so the five obligations of `rule:crash-handling` are
/// discharged in one place that cannot be forgotten or half-implemented at a call site.
pub fn fatal(kind: &str, summary: &str, details: &str, code: i32) -> ! {
    tracing::error!(kind, summary, details, "fatal — terminating");
    let report = write_report(kind, details);
    // Flush the log file NOW: `process::exit` runs no destructors, so the appender's worker would
    // otherwise be killed mid-buffer and take the final records with it.
    crate::logging::flush();
    notify_user(summary, report.as_deref());
    std::process::exit(code);
}

/// Install the process-wide panic hook. Call this FIRST, before the Tauri builder — a panic during
/// startup (a missing app data dir, a failing plugin) must be recorded too, and that happens before
/// logging is even initialised.
///
/// The hook logs, records, tells the user and exits with [`EXIT_PANIC`]. It does not unwind back into
/// an application whose invariants it can no longer vouch for: continuing here would be the swallowed
/// error at the top of the stack that ADR-CORE-037 forbids.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // A panic raised while we are already handling one (a broken writer, a panicking Display impl)
        // must not recurse. Abort immediately — noisily, and without pretending we can still help.
        if CRASHING.swap(true, Ordering::SeqCst) {
            std::process::abort();
        }

        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "<unknown location>".to_string());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());
        let backtrace = std::backtrace::Backtrace::force_capture();

        tracing::error!(location = %location, payload = %payload, "panic");
        // Keep the default hook's stderr output: worthless under `windows_subsystem = "windows"`, but
        // it is exactly what a developer running `cargo test` or `app:dev` in a terminal expects to see.
        previous(info);

        fatal(
            "panic",
            "The application hit an internal error and has to close.",
            &format!("panicked at {location}: {payload}\n\nbacktrace:\n{backtrace}"),
            EXIT_PANIC,
        );
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_names_the_kind_and_carries_the_details() {
        let body = compose("panic", "panicked at src/lib.rs:12: boom");
        assert!(body.contains("kind:    panic"));
        assert!(body.contains("panicked at src/lib.rs:12: boom"));
        assert!(body.contains(env!("CARGO_PKG_VERSION")));
    }

    #[test]
    fn writes_the_report_and_a_pending_marker() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = write_report_in(dir.path(), "panic", "boom").expect("write");

        assert!(path.is_file(), "the report itself must exist");
        assert!(
            std::fs::read_to_string(&path)
                .expect("read")
                .contains("boom"),
            "the report must carry the failure detail"
        );
        let marker = std::fs::read_to_string(dir.path().join(PENDING)).expect("marker");
        assert_eq!(marker.trim(), path.to_string_lossy());
    }

    #[test]
    fn two_crashes_never_overwrite_each_other() {
        let dir = tempfile::tempdir().expect("tempdir");
        let first = write_report_in(dir.path(), "panic", "one").expect("write");
        let second = write_report_in(dir.path(), "panic", "two").expect("write");

        assert_ne!(first, second, "each crash keeps its own report");
        assert!(first.is_file() && second.is_file());
    }

    #[test]
    fn pending_marker_is_consumed_exactly_once() {
        let dir = tempfile::tempdir().expect("tempdir");
        let report = write_report_in(dir.path(), "panic", "boom").expect("write");

        assert_eq!(
            take_pending_in(dir.path()).as_deref(),
            Some(report.as_path())
        );
        // The notice is shown once. A second launch must not nag about the same crash again.
        assert_eq!(take_pending_in(dir.path()), None);
    }

    #[test]
    fn no_marker_means_the_last_run_was_clean() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert_eq!(take_pending_in(dir.path()), None);
    }

    #[test]
    fn a_marker_pointing_at_a_deleted_report_is_not_announced() {
        let dir = tempfile::tempdir().expect("tempdir");
        let report = write_report_in(dir.path(), "panic", "boom").expect("write");
        std::fs::remove_file(&report).expect("user cleaned up the report");

        // Telling the user about a report that is no longer there is worse than saying nothing.
        assert_eq!(take_pending_in(dir.path()), None);
        assert!(
            !dir.path().join(PENDING).exists(),
            "the stale marker is cleared"
        );
    }

    #[test]
    fn exit_codes_are_distinct_and_non_zero() {
        // A supervisor (or a CI run) must be able to tell WHY the process died.
        for code in [EXIT_PANIC, EXIT_STARTUP, EXIT_UI_CRASH] {
            assert_ne!(code, 0, "a crash never exits 0");
        }
        assert_ne!(EXIT_PANIC, EXIT_STARTUP);
        assert_ne!(EXIT_PANIC, EXIT_UI_CRASH);
        assert_ne!(EXIT_STARTUP, EXIT_UI_CRASH);
    }
}
