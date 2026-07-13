---
id: mem:logging-contract
title: Every IPC command logs its result via Serialize for AppError
tldr: "rule:logging needs action + result logs; central chokepoint is Serialize for AppError which tracing::error!s every IPC error — never bypass it."
scope: backend
load: core
type: feedback
---

The project's `.claude/rules/logging.md` and ADR-APP-025 require each `#[tauri::command]` to log
both "the action it performs **and** its result". I initially shipped commands with the action
half (`tracing::debug!("get_settings")`) but no log on the error path, so a failing command
produced **zero** backend log lines — the error string only travelled
`AppError → Serialize → frontend.invoke().catch()`.

The fix is one chokepoint, not a per-command audit: `Serialize for AppError`
(`src-tauri/src/error.rs`) calls
`tracing::error!(error = %msg, "command returned error")` before serialising. Any new error
variant or any new command automatically benefits.

**Why:** The maintainer requires the logging rule to be honoured *in full* — failures must
appear in the rolling JSON log and the live Logs view (ADR-APP-025 sinks) without the developer
spelunking the frontend console. He noticed the gap and corrected me explicitly.

**How to apply:**

- Keep the `tracing::error!` line in `Serialize for AppError`. Do **not** remove it when
  refactoring the error type.
- If you ever stop using `AppError` for IPC responses (e.g. raw `String` errors, or a new
  result type with its own `Serialize`), you must re-add equivalent central logging at the new
  chokepoint before that path lands.
- Per-command `tracing::debug!`/`tracing::info!` at entry still belongs on every command, for
  the *action* half of the contract.
