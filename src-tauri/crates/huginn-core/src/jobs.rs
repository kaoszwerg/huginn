//! The Job registry (ADR-PROJ-008, rule:jobs).
//!
//! **Nothing that takes longer than roughly 200 ms happens invisibly.** Downloading a model, hashing
//! it, loading it, transcribing, starting the worker — each is a Job: it has progress, an honest ETA,
//! and a cancel that actually stops the work rather than hiding the row.
//!
//! Three properties are load-bearing, and each one is a decision:
//!
//! * **The state lives here, in the backend.** The window is a view. Huginn keeps running in the
//!   tray, and closing the window must not kill a 3 GB download; reopening it must show that download
//!   exactly where it was.
//! * **The registry is the single logging chokepoint.** Every transition is logged here, once,
//!   structured — not at fifty call sites (rule:logging). What the footer shows, the log has.
//! * **An ETA is honest or absent.** Bytes per second, a measured real-time factor. Where no honest
//!   estimate exists, the job is *indeterminate* and says so. It never invents a number.
//!
//! **The recognised text never enters a job.** Not in a label, not in an error, not at `debug`
//! (ADR-PROJ-007). A job carries counts, durations and ids — never content.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use ts_rs::TS;

/// What kind of work a job is. The UI groups and labels by this; the log filters by it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
#[serde(rename_all = "snake_case")]
pub enum JobKind {
    /// Fetching a model file over the network — the only outbound traffic in the product
    /// (ADR-PROJ-006).
    ModelDownload,
    /// Verifying a model's SHA-256 against the value compiled into the binary.
    ModelVerify,
    /// Loading a model into memory in the worker process.
    ModelLoad,
    /// Turning captured audio into text.
    Transcribe,
}

/// Where a job is in its life. A job ends in exactly one of `Succeeded`, `Failed` or `Cancelled` —
/// and it always ends: a job left `Running` forever is the bug this enum exists to make visible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
#[serde(rename_all = "snake_case")]
pub enum JobState {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

impl JobState {
    /// Has this job stopped? Used to decide what may still be cancelled, and what may be swept.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Succeeded | Self::Failed | Self::Cancelled)
    }
}

/// How far along a job is.
///
/// `Determinate` carries the raw counts (bytes, samples, seconds) rather than a percentage: a
/// percentage discards the information the UI needs to render "412 MB of 1.5 GB", and it cannot be
/// used to compute a rate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum Progress {
    /// The honest answer when the total is genuinely unknown. It is not a failure to admit this —
    /// inventing a total so the bar can move is (rule:jobs).
    Indeterminate,
    Determinate {
        done: u64,
        total: u64,
    },
}

impl Progress {
    /// Fraction complete in `0.0..=1.0`, or `None` when indeterminate.
    pub fn fraction(self) -> Option<f64> {
        match self {
            Self::Indeterminate => None,
            Self::Determinate { total: 0, .. } => None,
            Self::Determinate { done, total } => Some((done as f64 / total as f64).clamp(0.0, 1.0)),
        }
    }
}

/// One unit of slow work, as the UI sees it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
pub struct Job {
    pub id: u64,
    pub kind: JobKind,
    /// What the user reads. Never the recognised text — not even a snippet (ADR-PROJ-007).
    pub label: String,
    pub state: JobState,
    pub progress: Progress,
    /// Milliseconds since the job started running.
    pub elapsed_ms: u64,
    /// Seconds remaining, or `None` when no honest estimate exists.
    pub eta_seconds: Option<u64>,
    pub cancellable: bool,
    /// Why it failed, in words a user can act on. `None` unless the state is `Failed`.
    pub error: Option<String>,
}

/// The live half of a job — the part that never crosses the IPC boundary.
struct Entry {
    job: Job,
    started: Instant,
    /// Set by `cancel`; the worker doing the job is expected to check it and stop.
    cancel: Arc<AtomicBool>,
}

/// A cancellation flag handed to whoever is doing the work.
///
/// **Cancelling must actually stop the work.** A registry that flips a row to "cancelled" while a
/// thread keeps downloading is worse than no cancel button: it lies, and it keeps the bandwidth.
#[derive(Debug, Clone)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    /// Check this between chunks, samples, or iterations — and stop when it is true.
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Relaxed)
    }
}

/// The registry. Cloneable, shared across threads; every long operation reports through it.
#[derive(Clone, Default)]
pub struct JobRegistry {
    inner: Arc<Registry>,
}

#[derive(Default)]
struct Registry {
    next_id: AtomicU64,
    entries: Mutex<HashMap<u64, Entry>>,
}

impl JobRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Start a job, and hand back its id and the token the worker must honour.
    ///
    /// The job starts in `Running`, not `Queued`: Huginn has no queue today, and a state the code
    /// cannot produce is a lie in the type (`Queued` stays for when a queue exists).
    pub fn start(
        &self,
        kind: JobKind,
        label: impl Into<String>,
        progress: Progress,
        cancellable: bool,
    ) -> (u64, CancelToken) {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let label = label.into();
        let cancel = Arc::new(AtomicBool::new(false));

        let job = Job {
            id,
            kind,
            label: label.clone(),
            state: JobState::Running,
            progress,
            elapsed_ms: 0,
            eta_seconds: None,
            cancellable,
            error: None,
        };

        if let Ok(mut entries) = self.inner.entries.lock() {
            entries.insert(
                id,
                Entry {
                    job,
                    started: Instant::now(),
                    cancel: cancel.clone(),
                },
            );
        }

        // The chokepoint: every transition is logged here, once (rule:logging).
        tracing::info!(job = id, ?kind, %label, cancellable, "job started");
        (id, CancelToken(cancel))
    }

    /// Report progress. Recomputes the ETA from the *measured* rate — never from a guess.
    pub fn progress(&self, id: u64, progress: Progress) {
        let Ok(mut entries) = self.inner.entries.lock() else {
            return;
        };
        let Some(entry) = entries.get_mut(&id) else {
            return;
        };

        let elapsed = entry.started.elapsed();
        entry.job.progress = progress;
        entry.job.elapsed_ms = elapsed.as_millis() as u64;
        entry.job.eta_seconds = eta(progress, elapsed);
    }

    /// The job finished, and did what it was asked.
    pub fn succeed(&self, id: u64) {
        self.finish(id, JobState::Succeeded, None);
    }

    /// The job failed. `error` is written for the user — it is what the UI shows.
    pub fn fail(&self, id: u64, error: impl Into<String>) {
        self.finish(id, JobState::Failed, Some(error.into()));
    }

    /// Ask a job to stop.
    ///
    /// This *requests* cancellation and marks the row; the work itself stops when whoever is doing it
    /// notices the token. A job that ignores its token is a defect, and it will show up here as a row
    /// that says "cancelled" while its thread keeps running.
    pub fn cancel(&self, id: u64) {
        let Ok(entries) = self.inner.entries.lock() else {
            return;
        };
        let Some(entry) = entries.get(&id) else {
            tracing::debug!(job = id, "cancel for a job that no longer exists");
            return;
        };
        if entry.job.state.is_terminal() {
            return;
        }
        if !entry.job.cancellable {
            tracing::warn!(
                job = id,
                "cancel requested for a job that cannot be cancelled"
            );
            return;
        }
        entry.cancel.store(true, Ordering::Relaxed);
        tracing::info!(job = id, "cancellation requested");
        drop(entries);
        self.finish(id, JobState::Cancelled, None);
    }

    fn finish(&self, id: u64, state: JobState, error: Option<String>) {
        let Ok(mut entries) = self.inner.entries.lock() else {
            return;
        };
        let Some(entry) = entries.get_mut(&id) else {
            return;
        };
        if entry.job.state.is_terminal() {
            return; // already over; the first outcome wins
        }

        entry.job.state = state;
        entry.job.elapsed_ms = entry.started.elapsed().as_millis() as u64;
        entry.job.eta_seconds = None;
        entry.job.error = error.clone();
        entry.job.cancellable = false;

        match state {
            JobState::Failed => {
                tracing::error!(
                    job = id,
                    kind = ?entry.job.kind,
                    elapsed_ms = entry.job.elapsed_ms,
                    error = error.as_deref().unwrap_or("unknown"),
                    "job failed"
                );
            }
            _ => {
                tracing::info!(
                    job = id,
                    kind = ?entry.job.kind,
                    ?state,
                    elapsed_ms = entry.job.elapsed_ms,
                    "job finished"
                );
            }
        }
    }

    /// Every job, newest first — what the process monitor renders.
    pub fn snapshot(&self) -> Vec<Job> {
        let Ok(entries) = self.inner.entries.lock() else {
            return Vec::new();
        };
        let mut jobs: Vec<Job> = entries
            .values()
            .map(|e| {
                let mut job = e.job.clone();
                if !job.state.is_terminal() {
                    // Elapsed keeps ticking for a running job even between progress reports.
                    job.elapsed_ms = e.started.elapsed().as_millis() as u64;
                }
                job
            })
            .collect();
        // Newest first: the job a user just started is the one they are looking for.
        jobs.sort_by_key(|j| std::cmp::Reverse(j.id));
        jobs
    }

    /// Drop finished jobs. The monitor keeps a short history; it is not an archive.
    pub fn sweep_finished(&self) {
        let Ok(mut entries) = self.inner.entries.lock() else {
            return;
        };
        entries.retain(|_, e| !e.job.state.is_terminal());
    }
}

/// Seconds remaining, from the rate actually observed so far.
///
/// `None` when there is nothing honest to say: an indeterminate job, a job with no total, one that
/// has not moved yet (a rate of zero would divide into infinity), or one that is already done.
fn eta(progress: Progress, elapsed: Duration) -> Option<u64> {
    let Progress::Determinate { done, total } = progress else {
        return None;
    };
    if done == 0 || total == 0 || done >= total {
        return None;
    }
    let secs = elapsed.as_secs_f64();
    if secs <= 0.0 {
        return None;
    }
    let rate = done as f64 / secs; // units per second, measured — not assumed
    let remaining = (total - done) as f64;
    Some((remaining / rate).ceil() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_started_job_is_running_and_visible() {
        let reg = JobRegistry::new();
        let (id, _cancel) = reg.start(
            JobKind::ModelDownload,
            "whisper base",
            Progress::Determinate {
                done: 0,
                total: 100,
            },
            true,
        );

        let jobs = reg.snapshot();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, id);
        assert_eq!(jobs[0].state, JobState::Running);
        assert!(jobs[0].cancellable);
    }

    #[test]
    fn progress_is_carried_as_counts_not_a_percentage() {
        // The UI needs "412 MB of 1500 MB", and a rate cannot be computed from a percentage.
        let reg = JobRegistry::new();
        let (id, _) = reg.start(
            JobKind::ModelDownload,
            "model",
            Progress::Indeterminate,
            true,
        );

        reg.progress(
            id,
            Progress::Determinate {
                done: 412,
                total: 1500,
            },
        );

        let job = &reg.snapshot()[0];
        assert_eq!(
            job.progress,
            Progress::Determinate {
                done: 412,
                total: 1500
            }
        );
        assert!((job.progress.fraction().expect("determinate") - 0.2746).abs() < 0.001);
    }

    #[test]
    fn an_indeterminate_job_has_no_fraction_and_no_eta() {
        // It says "I do not know" instead of inventing a number (rule:jobs).
        assert_eq!(Progress::Indeterminate.fraction(), None);
        assert_eq!(eta(Progress::Indeterminate, Duration::from_secs(10)), None);
    }

    #[test]
    fn the_eta_comes_from_the_measured_rate() {
        // 50 of 100 units in 10 seconds → 5 units/second → 10 seconds left.
        let remaining = eta(
            Progress::Determinate {
                done: 50,
                total: 100,
            },
            Duration::from_secs(10),
        );
        assert_eq!(remaining, Some(10));
    }

    #[test]
    fn a_job_that_has_not_moved_yet_reports_no_eta_rather_than_infinity() {
        let remaining = eta(
            Progress::Determinate {
                done: 0,
                total: 100,
            },
            Duration::from_secs(5),
        );
        assert_eq!(remaining, None);
    }

    #[test]
    fn cancelling_actually_tells_the_worker_to_stop() {
        // The row saying "cancelled" while the thread keeps downloading is the failure this prevents.
        let reg = JobRegistry::new();
        let (id, token) = reg.start(
            JobKind::ModelDownload,
            "model",
            Progress::Indeterminate,
            true,
        );
        assert!(!token.is_cancelled());

        reg.cancel(id);

        assert!(
            token.is_cancelled(),
            "the worker must learn it was cancelled"
        );
        assert_eq!(reg.snapshot()[0].state, JobState::Cancelled);
    }

    #[test]
    fn a_job_that_cannot_be_cancelled_is_not_cancelled_behind_the_users_back() {
        let reg = JobRegistry::new();
        let (id, token) = reg.start(
            JobKind::ModelVerify,
            "hashing",
            Progress::Indeterminate,
            false,
        );

        reg.cancel(id);

        assert!(!token.is_cancelled());
        assert_eq!(reg.snapshot()[0].state, JobState::Running);
    }

    #[test]
    fn the_first_outcome_wins() {
        // A job that succeeded cannot later be marked failed by a straggling error path.
        let reg = JobRegistry::new();
        let (id, _) = reg.start(
            JobKind::Transcribe,
            "transcribing",
            Progress::Indeterminate,
            true,
        );

        reg.succeed(id);
        reg.fail(id, "a late error");

        let job = &reg.snapshot()[0];
        assert_eq!(job.state, JobState::Succeeded);
        assert_eq!(job.error, None);
    }

    #[test]
    fn a_failure_carries_a_reason_the_user_can_act_on() {
        let reg = JobRegistry::new();
        let (id, _) = reg.start(
            JobKind::ModelVerify,
            "verifying",
            Progress::Indeterminate,
            false,
        );

        reg.fail(id, "checksum did not match — the file was deleted");

        let job = &reg.snapshot()[0];
        assert_eq!(job.state, JobState::Failed);
        assert!(job.error.as_deref().unwrap_or("").contains("checksum"));
        assert!(!job.cancellable, "a finished job cannot be cancelled");
    }

    #[test]
    fn finished_jobs_are_swept_but_running_ones_survive() {
        let reg = JobRegistry::new();
        let (done, _) = reg.start(
            JobKind::ModelLoad,
            "loading",
            Progress::Indeterminate,
            false,
        );
        let (running, _) = reg.start(
            JobKind::Transcribe,
            "transcribing",
            Progress::Indeterminate,
            true,
        );
        reg.succeed(done);

        reg.sweep_finished();

        let jobs = reg.snapshot();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, running);
    }

    #[test]
    fn the_newest_job_is_first() {
        let reg = JobRegistry::new();
        let (first, _) = reg.start(JobKind::ModelDownload, "a", Progress::Indeterminate, true);
        let (second, _) = reg.start(JobKind::ModelVerify, "b", Progress::Indeterminate, false);

        let jobs = reg.snapshot();
        assert_eq!(jobs[0].id, second);
        assert_eq!(jobs[1].id, first);
    }
}
