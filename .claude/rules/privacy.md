---
id: rule:privacy
title: Privacy & data egress
tldr: "No telemetry, analytics, crash-reporting or phone-home: the app sends nothing off-device without an explicit, opt-in, ADR-backed feature and user consent."
scope: global
load: conditional
triggers: [privacy, telemetry, analytics, tracking, egress, network, consent, phone-home, crash-report]
applies-to: []
---

# Privacy & data egress (ADR-CORE-011)

- **No egress by default.** The app sends **no** data off the device — no telemetry, analytics,
  crash/usage reporting, auto-update pings or remote logging — unless a specific feature requires it.
- **Egress is a conscious, documented decision.** Any outbound data flow is an explicit, **opt-in**
  feature with its own ADR, off unless the user turns it on, and states exactly what leaves the device
  and where to. HTTPS-only with timeouts (rule:security).
- **Local-first data.** User data, logs and settings stay on-device; nothing is uploaded, and logs never
  carry secrets or personal content (rule:logging, rule:security).
- **No silent identifiers.** No device fingerprint, install ID or usage beacon is created or sent
  without disclosure and consent.
