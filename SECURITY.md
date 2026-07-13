# Security Policy

## Supported versions

The latest commit on `main` (and the most recent release) is supported.

## Reporting a vulnerability

Please report security issues **privately** — do **not** open a public issue.

- Email: **steve.breunig@gmail.com**
- Include: affected version/commit, steps to reproduce, impact, and any logs (with
  secrets redacted).

You'll get an acknowledgement as soon as possible. Please allow time for a fix
before any public disclosure.

## Credential & data handling (by design)

The app currently handles no credentials. The rules that apply the moment it does are fixed in
[ADR-CORE-011](docs/adr/011-security-by-design.md):

- Credentials live in the OS keyring, never in the binary and never in app-data files. The frontend
  can only ever query their presence, not their values.
- Tokens are negotiated in the Rust backend and never cross the IPC boundary, except where a feature
  explicitly requires a short-lived token at request time.
- Every IPC command validates its input at the boundary; the webview is untrusted.
- Least-privilege Tauri capabilities, strict CSP, HTTPS-only with timeouts.
- Logs carry lifecycle, counts, durations and errors — never secrets or PII.

Supply chain is gated by `cargo-deny`, `cargo audit` and `secretlint` in `npm run check:all`.
