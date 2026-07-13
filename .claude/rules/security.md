---
id: rule:security
title: Security
tldr: "Validate every input at the trust boundary; least privilege; secrets in the OS keyring, never in logs or a client; HTTPS + timeouts; advisories block the push."
scope: global
load: conditional
triggers: [security, secret, redaction, capability, permission, network, path, boundary, threat]
applies-to: []
---

# Security (ADR-CORE-011)

- **Every boundary validates its input.** Anything crossing from a less-trusted context (a UI, a
  network, a file, a user) is validated at the point it enters — never deeper, never "the caller checked
  it". Treat the client as hostile even when you wrote it.
- **Least privilege.** A permission, capability or scope is granted only when a feature actually needs
  it, and only as wide as that feature requires. The default posture is deny.
- **Secrets.** Credentials belong in the OS keyring — never in the binary, in a config or data file, in
  logs, or in a client. A client may learn *that* a credential exists, never its value.
- **Filesystem.** Write only inside the location the platform designates for the app's data, resolved
  through the platform API — never next to the binary, never to a path supplied by a client without
  validation. Canonicalise any user-supplied path and verify it against an allowed root (no traversal).
- **Network.** HTTPS only, with an explicit timeout on every request.
- **Threat model per feature.** Every feature that adds an input, a capability, a network host or a
  stored secret records its trust boundary and the abuse cases it defends against — a short note in the
  feature's ADR. The posture is decided up front, not patched after a report.
- **Advisories block the push.** The supply-chain and secret scanners run in `check:all` and before every
  push. A finding **stops the push** and goes to the maintainer, who decides the course (patch, upgrade,
  replace, or an explicit, time-boxed, recorded exception). **Never silence or auto-suppress a finding to
  make the gate green** (rule:dependencies).

**The concrete mechanisms** — which keyring, which capability file, which CSP, which scanner — are the
stack layer's business. The obligations above are not.
