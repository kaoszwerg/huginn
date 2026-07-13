---
id: ADR-APP-025
title: Logging architecture — JSON file + ring buffer + live UI stream
status: accepted
tldr: "tracing fans out to a pretty console layer, a rotating JSON file, and an in-memory ring buffer broadcast live to the UI log view; secret-free per ADR-CORE-011."
scope: backend
load: conditional
triggers: [logging, logs, tracing, observability, log-view, json-logs]
applies-to: ["src-tauri/src/logging.rs", "src/views/LogsView.tsx", "src/hooks/useLogs.ts"]
supersedes: []
superseded-by: null
---

## Context

The app uses `tracing` for structured logging (rules/logging). We want detailed, structured logs with
sensible levels, persisted across runs, plus a live in-app log view with highlighting, filtering,
search and sorting — without ever leaking secrets (ADR-CORE-011).

## Decision

`logging::init(data_dir)` builds one `tracing` subscriber that fans out to three layers:

1. **Console** (compact) — for `tauri dev` / terminal.
2. **Rotating JSON file** — `tracing-appender` daily rotation under `<app_data_dir>/logs/app.log`,
   structured JSON (one object per event). This is the persisted history.
3. **Ring-buffer + broadcast layer** — a custom `Layer` captures each event (timestamp, level, target,
   message, structured fields → JSON) into a bounded in-memory `VecDeque` (last ~2000) and a
   `tokio::broadcast` channel. `setup()` bridges the channel to the frontend via the `log://record`
   Tauri event; `get_recent_logs` returns the buffer for initial load.

Levels honour `RUST_LOG` (default `info`). The **frontend** `LogsView` consumes the live stream
(`useLogs`) and provides level filter, full-text search, sort (newest/oldest), pause and clear, with
level-coloured records and lightly highlighted `key=value` fields.

**Secret hygiene (ADR-CORE-011):** logs carry only lifecycle, counts, durations, ids and errors — never
tokens, credentials or user content. The JSON file inherits the same guarantee.

## Alternatives

- *External log file only* (no in-app view): simpler, but the user explicitly wanted a live UI with
  filtering/search.
- *DB-backed log store*: heavier; the rotating file is the durable record and the ring buffer covers
  the live view — no database needed for logs.

## Consequences

- New deps: `tracing-appender` + the `json` feature of `tracing-subscriber` (stable, ADR-CORE-009).
- The `tracing` subscriber is initialised in `setup()` (after the data dir is known), so the very
  first lines before setup are not captured — acceptable (setup runs immediately).
- Log files accumulate (daily rotation); cleanup/retention can be added later if needed.
