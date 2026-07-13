---
id: rule:overlay-and-input
title: Overlay, hotkey & text injection
tldr: "The overlay must never take focus. Native window code on both platforms; it exists only while recording. Pin global-shortcut >= 2.3.2; no Option-only hotkeys."
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
    passthrough,
    hotkey,
    shortcut,
    push-to-talk,
    keybind,
    inject,
    injection,
    paste,
    clipboard,
    sendinput,
    nspanel,
    hwnd,
    tray,
    autostart,
  ]
applies-to: ["src-tauri/**", "src/components/overlay/**"]
---

# Overlay, hotkey & text injection (ADR-PROJ-004)

## The one that breaks the product

- **The overlay must not steal focus.** Huginn types into whatever application the user was in. If the
  overlay activates Huginn's own app when it appears, that target is gone. This is not a polish item; it
  is the difference between a working product and a broken one.
- **No cross-platform API gives you this.** Not Tauri (`focused(false)` is unsupported on macOS;
  `focusable: false` steals focus anyway — tauri#9065, #14102, #15017), not winit. It is written by hand:
  `WS_EX_NOACTIVATE` via `hwnd()` on Windows, a **non-activating `NSPanel`** via `ns_window()` + `objc2`
  on macOS. That code is a permanent, owned part of `huginn-platform` — not a hack to remove later.
- **A plain `NSWindow` cannot draw over a fullscreen app** (tauri#9556). Dictating into a fullscreen
  editor needs the same `NSPanel`.

## Window lifecycle

- **The overlay exists only while recording**, and is destroyed afterwards. Two reasons and both are
  binding: the privacy promise ("Huginn works only during an active recording"), and tauri#15471 — a
  transparent window costs ~8× GPU power on macOS for as long as it exists, even when nothing moves.
- **Click-through is per window** (`set_ignore_cursor_events`): the overlay ignores the cursor; the
  settings window does not.
- **Prove it in a signed release build, never in `tauri dev`** — tauri#13415 reports transparency working
  in dev and turning opaque in the bundled DMG (rule:verification).

## Hotkey

- **Pin `tauri-plugin-global-shortcut >= 2.3.2`.** Earlier versions burn a whole CPU core for as long as
  the key is held (global-hotkey#176).
- **Push-to-talk needs key-up**: use `ShortcutState::Pressed` **and** `::Released`. On Windows, key-up is
  polled every 50 ms — that latency is expected and acceptable.
- **Never bind a media key** as the default: it routes through a `CGEventTap` on macOS and triggers the
  Input-Monitoring permission prompt. Regular combinations need **no** permission.
- **Never bind Option alone** (or Option+Shift): macOS Sequoia rejects it (`-9868`), an anti-keylogger
  measure.
- A registration failure (`AlreadyRegistered`) is **shown to the user**, never swallowed (rule:logging).

## Injection

- A platform trait with two strategies: synthesised keystrokes (`SendInput` / `CGEvent`) or
  clipboard-and-paste. Clipboard use is **never silent** — it is a setting, and it restores the previous
  clipboard contents afterwards.
- A failed insertion is reported to the user. Text that vanished silently is the worst possible bug in a
  dictation tool.
