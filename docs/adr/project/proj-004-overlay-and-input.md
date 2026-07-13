---
id: ADR-PROJ-004
title: Overlay and input — a focus-neutral HUD, push-to-talk, and platform-native window code
status: accepted
tldr: "The overlay must never steal focus, or the text has nowhere to go — no cross-platform API can. Native window code on both platforms; push-to-talk needs key-up."
scope: architecture
load: conditional
triggers:
  [
    overlay,
    hud,
    window,
    focus,
    transparent,
    always-on-top,
    click-through,
    hotkey,
    shortcut,
    push-to-talk,
    injection,
    paste,
    sendinput,
    nspanel,
    tray,
    autostart,
  ]
applies-to: ["src-tauri/**", "src/components/overlay/**"]
supersedes: []
superseded-by: null
---

## Context

The overlay is the product's most fragile surface, and its hardest requirement is the one that is easy
to miss: **it must not take focus.** Huginn inserts text into whatever application the user was working
in. If the overlay activates its own app when it appears, that target is gone and the text has nowhere
to land. Everything else about the window — transparent, borderless, always-on-top, click-through — is
comparatively easy.

Verified, July 2026:

- **Focus-neutrality is not reachable through the Tauri window API.** `focused(false)` is "unsupported on
  macOS" (maintainer, tauri#7519); `focusable: false` steals focus anyway (#14102); `tao` calls
  `activateIgnoringOtherApps(true)` unconditionally and Tauri does not expose the switch (#15017); there
  is no native `NSPanel` support (#13034). The same is true one layer down, in `winit`. This is a
  **platform** problem, not a framework problem — it would have to be solved by hand in *any* stack.
- **Windows** has a clean escape hatch: `Window::hwnd()` is public, so `WS_EX_NOACTIVATE` can be set via
  `windows-rs`.
- **macOS** needs a non-activating `NSPanel` through `ns_window()` + `objc2`. The community
  `tauri-nspanel` plugin exists and is actively maintained — and states itself that it does not prevent
  focus stealing. This is owned code, not a dependency to trust blindly.
- **A normal `NSWindow` cannot draw over a fullscreen app** (tauri#9556/#9439) — only an `NSPanel` can.
  Dictating into a fullscreen editor therefore *requires* the same `NSPanel` work.
- **Push-to-talk works**: `tauri-plugin-global-shortcut` exposes `ShortcutState::Pressed` **and**
  `::Released` (verified in `global-hotkey`'s source, not merely in its docs). macOS is event-driven via
  Carbon; Windows polls `GetAsyncKeyState` every 50 ms, so key-up carries up to 50 ms of latency.
- **`tauri-plugin-global-shortcut` must be pinned `>= 2.3.2`.** Earlier versions burn a full CPU core
  for as long as the key is held (global-hotkey#176).
- Carbon's `RegisterEventHotKey` needs **no** accessibility permission on macOS — **unless** a media key
  is bound, which routes through a `CGEventTap` and triggers the Input-Monitoring prompt.
- macOS Sequoia rejects hotkeys using **Option alone** (`-9868 eventInternalErr`), an anti-keylogger
  measure.

## Decision

- **The overlay window is created and configured with platform-native code from day one**, not retrofitted:
  `WS_EX_NOACTIVATE` on Windows; a non-activating `NSPanel` on macOS. It is a permanent, owned part of
  `huginn-platform`, behind one trait.
- **The overlay exists only while recording** and is destroyed afterwards. This is the privacy promise
  ("Huginn works only during an active recording") and it also sidesteps tauri#15471, where a transparent
  window costs ~8× GPU power on macOS for as long as it exists, even when nothing moves.
- **Click-through is per window** (`set_ignore_cursor_events`): the overlay ignores the cursor, the
  settings window does not.
- **Push-to-talk is the interaction model**: hold to speak, release to transcribe. The hotkey default
  must be **neither a media key nor Option-only**. The choice is validated when it is registered, and a
  refusal is surfaced to the user rather than swallowed.
- **Text injection is a platform trait with two implementations**, chosen per platform and overridable in
  settings: synthesised keystrokes (`SendInput` / `CGEvent`) or clipboard-and-paste with save/restore.
  Clipboard use is never silent: it is a setting, it restores the previous clipboard contents, and it is
  documented. Neither strategy is assumed to work everywhere — the failure is reported, never swallowed.
- **Nothing here is believed until it is proven in a signed release build**, not `tauri dev` — tauri#13415
  reports transparency working in dev and turning opaque in a bundled DMG. The spike in `PLAN.md` is the
  gate.

## Alternatives

- **A pure-Rust toolkit to avoid the native code** — rejected: the native code is needed there too
  (ADR-PROJ-001).
- **Toggle (tap to start, tap to stop) instead of push-to-talk** — rejected as the default: holding is
  unambiguous, self-limiting and impossible to leave running by accident, which matches a product whose
  promise is that it only listens while you make it. It stays available as an option; it is not the
  default.
- **A wake word / always-listening** — rejected outright. It contradicts the product (mem:project-scope).

## Consequences

- Two hand-written platform paths for the overlay window, and they must be tested on real hardware.
- Windows key-up latency of up to 50 ms is accepted (imperceptible for dictation); if it ever matters, a
  raw-input path replaces the polling.
- Autostart is a user setting, off by default. On macOS the modern path (`SMAppService`) requires a
  signed app, so it cannot be verified until the Apple account exists (ADR-PROJ-002) — that is recorded,
  not hidden.

## References

- ADR-PROJ-001 (stack), ADR-PROJ-005 (speech), ADR-PROJ-008 (jobs), rule:overlay-and-input.
- tauri#7519, #9065, #9439, #9556, #13034, #13415, #14102, #15017, #15471; global-hotkey#176;
  Apple Developer Forums #763878 (Sequoia / Option-only hotkeys).
