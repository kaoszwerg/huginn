---
id: rule:cross-platform
title: Cross-platform parity
tldr: "Every feature works or degrades gracefully on Windows, macOS and Linux (WebKitGTK); platform-specific code is isolated, tested, and free of hardcoded paths."
scope: global
load: conditional
triggers: [platform, cross-platform, windows, macos, linux, webkitgtk, os, portability]
applies-to: ["src-tauri/**", "src/**"]
---

# Cross-platform parity (ADR-APP-001)

- **Parity is the default.** Every feature works — or degrades gracefully — on Windows, macOS and
  Linux; a feature that cannot is gated per-OS and its absence handled, never left broken on one.
- **Isolate platform code.** Platform-specific branches are small, isolated and commented; resolve OS
  paths through Tauri's `app.path()` — never hardcode platform paths (rule:rust-conventions).
- **WebKitGTK is the weakest target.** The UI avoids Linux-weak features (`backdrop-filter`/blur) and
  provides solid fallbacks (rule:ui-design); test the rendering there, not only on Windows/macOS.
- **Verify on the OSes you touch.** Platform-specific behaviour is confirmed on the affected OS (or the
  CI matrix, ADR-APP-023), not assumed from one platform.
