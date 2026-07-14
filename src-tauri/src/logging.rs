//! Structured logging (ADR-APP-025): pretty console + JSON to a rotating file + an in-memory ring buffer
//! with a live broadcast for the UI log view. Secret-free (ADR-CORE-011): never log credentials or tokens
//! — only lifecycle, counts, durations and errors.

use serde::Serialize;
use std::collections::VecDeque;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tokio::sync::broadcast;
use tracing::field::{Field, Visit};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::layer::{Context, SubscriberExt};
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, Layer};
use ts_rs::TS;

const BUFFER_CAP: usize = 2000;

/// One captured log record, sent to the UI live and kept in the ring buffer.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct LogRecord {
    /// ISO-8601 UTC timestamp (UI localises).
    pub ts: String,
    /// ERROR | WARN | INFO | DEBUG | TRACE
    pub level: String,
    /// The `tracing` target (module path) that emitted the event.
    pub target: String,
    /// The event's primary human-readable message.
    pub message: String,
    /// JSON object of the event's structured fields.
    pub fields: String,
}

struct LogState {
    buffer: Mutex<VecDeque<LogRecord>>,
    tx: broadcast::Sender<LogRecord>,
}

static STATE: OnceLock<LogState> = OnceLock::new();
/// The non-blocking file appender's worker guard. A `Mutex<Option<..>>` rather than a `OnceLock` so the
/// crash path can **drop** it ([`flush`]) before a `process::exit` that would otherwise run no
/// destructors and take the last records — the ones describing the crash — with it (ADR-APP-032).
static GUARD: Mutex<Option<WorkerGuard>> = Mutex::new(None);

fn state() -> &'static LogState {
    STATE.get_or_init(|| {
        let (tx, _rx) = broadcast::channel(512);
        LogState {
            buffer: Mutex::new(VecDeque::with_capacity(BUFFER_CAP)),
            tx,
        }
    })
}

/// Snapshot of the most recent records (for initial load in the UI).
pub fn recent() -> Vec<LogRecord> {
    state()
        .buffer
        .lock()
        .map(|b| b.iter().cloned().collect())
        .unwrap_or_default()
}

/// Subscribe to the live record stream.
pub fn subscribe() -> broadcast::Receiver<LogRecord> {
    state().tx.subscribe()
}

fn push(rec: LogRecord) {
    if let Ok(mut buf) = state().buffer.lock() {
        if buf.len() >= BUFFER_CAP {
            buf.pop_front();
        }
        buf.push_back(rec.clone());
    }
    let _ = state().tx.send(rec); // ignore: no subscribers is fine
}

/// Collects an event's message + structured fields into JSON.
#[derive(Default)]
struct FieldVisitor {
    message: String,
    fields: serde_json::Map<String, serde_json::Value>,
}

impl FieldVisitor {
    fn put(&mut self, field: &Field, value: serde_json::Value) {
        if field.name() == "message" {
            self.message = value
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| value.to_string());
        } else {
            self.fields.insert(field.name().to_string(), value);
        }
    }
}

impl Visit for FieldVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.put(field, serde_json::Value::String(format!("{value:?}")));
    }
    fn record_str(&mut self, field: &Field, value: &str) {
        self.put(field, serde_json::Value::String(value.to_string()));
    }
    fn record_i64(&mut self, field: &Field, value: i64) {
        self.put(field, serde_json::Value::from(value));
    }
    fn record_u64(&mut self, field: &Field, value: u64) {
        self.put(field, serde_json::Value::from(value));
    }
    fn record_bool(&mut self, field: &Field, value: bool) {
        self.put(field, serde_json::Value::from(value));
    }
    fn record_f64(&mut self, field: &Field, value: f64) {
        self.put(field, serde_json::Value::from(value));
    }
}

/// Tracing layer that captures each event into the ring buffer + live broadcast.
struct BufferLayer;

impl<S: tracing::Subscriber> Layer<S> for BufferLayer {
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        let mut v = FieldVisitor::default();
        event.record(&mut v);
        push(LogRecord {
            ts: chrono::Utc::now().to_rfc3339(),
            level: meta.level().to_string(),
            target: meta.target().to_string(),
            message: v.message,
            fields: serde_json::Value::Object(v.fields).to_string(),
        });
    }
}

/// Initialise logging: console + JSON file (rotating daily under `<data_dir>/logs`) + the UI buffer.
/// Honours `RUST_LOG`, defaults to `info` with our own crate at `debug`. Only the first call wins.
pub fn init(data_dir: &Path) {
    let logs_dir = data_dir.join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "app.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    if let Ok(mut slot) = GUARD.lock() {
        *slot = Some(guard); // keep the worker alive for the process lifetime; dropped by flush() on a crash
    }

    // Default: our crate at debug (so the UI log view shows detailed records), dependencies at info
    // to keep the noise down. Override entirely via RUST_LOG.
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(format!("info,{}=debug", env!("CARGO_CRATE_NAME"))));

    let registry = tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .compact(),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .with_writer(non_blocking),
        )
        .with(BufferLayer);
    let _ = registry.try_init();
}

/// Flush and drop the file appender's worker guard — called from the crash path only ([`crate::crash`]).
///
/// `tracing_appender`'s non-blocking writer hands records to a background thread and flushes them when
/// its `WorkerGuard` is dropped — but a crash ends the process with `std::process::exit`, which runs
/// **no destructors**. Without this, the last records written before a crash — the very ones describing
/// it — would die in that buffer. After it returns the file sink is gone; the next statement is the exit.
pub fn flush() {
    if let Ok(mut slot) = GUARD.lock() {
        drop(slot.take());
    }
}

// The panic hook lives in `crate::crash` (ADR-APP-032), not here. It still routes the panic through
// `tracing` as this module's hook did, and adds what ADR-CORE-037 requires on top: a synchronous crash
// report, a flushed log file, a message the user actually sees, and a deliberate exit code. It must be
// installed BEFORE logging exists — a panic while resolving the app data dir happens before `init` has
// ever run — which is why it cannot be owned by this module.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buffer_captures_debug_and_info() {
        let filter = EnvFilter::new(format!("info,{}=debug", env!("CARGO_CRATE_NAME")));
        let subscriber = tracing_subscriber::registry()
            .with(filter)
            .with(BufferLayer);
        tracing::subscriber::with_default(subscriber, || {
            tracing::debug!(target: concat!(env!("CARGO_CRATE_NAME"), "::commands"), marker = 1, "a debug record");
            tracing::info!(target: concat!(env!("CARGO_CRATE_NAME"), "::settings"), "an info record");
        });
        let recs = recent();
        assert!(
            recs.iter()
                .any(|r| r.level == "DEBUG" && r.message == "a debug record"),
            "debug record must reach the buffer"
        );
        assert!(recs
            .iter()
            .any(|r| r.level == "INFO" && r.message == "an info record"));
    }
}
