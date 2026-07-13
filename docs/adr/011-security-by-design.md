---
id: ADR-011
title: Security by design — hardened Tauri, validated IPC, no secret leakage
status: accepted
tldr: "Credentials in the OS keyring and never in the frontend; least-privilege capabilities, strict CSP, validated IPC inputs, app-data-only writes, HTTPS-only."
scope: global
load: core
triggers: [security, secret, redaction, csp, capabilities, network, privacy, ipc, keyring]
applies-to: ["src-tauri/**", "src/**"]
supersedes: []
superseded-by: null
---

## Context

A desktop app runs with the user's full privileges and embeds a webview. Anything it stores, logs or
exposes over IPC is a potential leak, so the security posture is decided up front rather than patched
in once a feature needs a credential.

## Decision

- **Credential storage:** any credential a feature needs lives in the **OS keyring**. Credentials
  never enter the binary, an app-data file, the frontend bundle or a log line. The frontend may learn
  that a credential is present, never its value.
- **IPC:** every command validates its input at the boundary (`open_external` rejects any scheme
  other than http/https). The webview is treated as untrusted input.
- **Tauri hardening:** least-privilege `capabilities/default.json` and a strict CSP
  (`default-src 'self'`). Each permission and each CSP host is added only when a feature needs it,
  in the change that needs it.
- **Filesystem:** writes go only to the OS app-data directory resolved via `app.path()`; settings are
  written atomically (temp file + rename).
- **Network:** `rustls` TLS, HTTPS-only, timeouts on every request.
- **Logging:** lifecycle, counts, durations and errors only. Tokens, secrets and PII are forbidden in
  log records (rule:logging).
- `.gitignore` excludes app data, local state and env files.

## Alternatives

- **Secrets embedded at build time** — rejected: leaks on binary inspection, and rotating a secret
  would mean a rebuild.
- **Broad capabilities "for convenience"** — rejected: a capability that exists is a capability the
  webview can call.

## Consequences

- Strong privacy guarantees; the security surface is auditable in one place (capabilities + CSP +
  command list).
- Every new feature that talks to the outside world must extend the CSP and capabilities explicitly.

## References

- rule:logging (what may never reach a log record), rule:security, rule:privacy.
- The concrete mechanisms — which keyring, which capability model, which CSP, which TLS stack — belong to
  the layer that owns the runtime (ADR-033).
