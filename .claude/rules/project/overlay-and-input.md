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

## Window lifecycle — **do not "fix" this back**

- **The overlay window is built ONCE, at startup, and afterwards only shown and hidden.** Never create
  it when the key goes down. This is not a preference — it is a measurement (2026-07-13,
  `docs/spike-1a-windows.md`): **`WebviewWindowBuilder::build()` takes the keyboard focus the instant it
  returns**, even with `.visible(false)` and `.focused(false)`, and `WS_EX_NOACTIVATE` set afterwards is
  too late. Creating it per recording sends every dictated word to the wrong window.
  Showing (`SetWindowPos` + `SWP_NOACTIVATE`) and hiding (`SW_HIDE`) cannot take the focus. It is also
  50× faster: 3 ms to appear instead of 158 ms.
- **Building it at startup still steals the foreground** — so hand it straight back
  (`SetForegroundWindow`, which Windows grants only to the process that currently holds it: us, right
  then).
- **It is on screen only while recording.** The window exists; it is not *visible*. The privacy promise
  is about the microphone, the audio and the text — a hidden window renders nothing and holds nothing.
- **tauri#15471 is now the open question, not a settled one**: a transparent window costing ~8× GPU power
  on macOS for as long as it *exists* applies to a window that exists permanently. Measure it
  (`scripts/project/measure-idle.mjs`), do not assume it. On macOS the panel may have to be handled
  differently — that is what the platform trait is for.
- **Click-through is per window** (`set_ignore_cursor_events`): the overlay ignores the cursor; the
  settings window does not.
- **Prove it in a signed release build, never in `tauri dev`** — tauri#13415 reports transparency working
  in dev and turning opaque in the bundled DMG (rule:verification).

## Hotkey

- **Pin `tauri-plugin-global-shortcut >= 2.3.2`.** Earlier versions burn a whole CPU core for as long as
  the key is held (global-hotkey#176).
- **Push-to-talk needs key-up**: use `ShortcutState::Pressed` **and** `::Released`. On Windows, key-up is
  polled every 50 ms — measured at ~60 ms overshoot on a 1500 ms hold; expected and acceptable.
- **The hotkey is a user setting, and the default is only a default.** `Ctrl+Alt+Space` was already taken
  on the maintainer's machine — assume any combination can be. The recorder lives in the settings
  (`HotkeyField`), and the string it produces (`Ctrl+Shift+KeyJ` — the *physical* `KeyboardEvent.code`,
  never `key`, which moves with the keyboard layout) is a **contract pinned by tests on both sides**.
- **Never bind a media key** as the default: it routes through a `CGEventTap` on macOS and triggers the
  Input-Monitoring permission prompt. Regular combinations need **no** permission.
- **Never bind Option alone** (or Option+Shift): macOS Sequoia rejects it (`-9868`), an anti-keylogger
  measure.
- **`Fn` cannot be bound at all.** `Code::Fn` exists in `keyboard-types` but `global-hotkey` maps it to
  no platform keycode on either OS — a registration answers `FailedToRegister("Unknown VKCode for Fn")`.
  Huginn refuses it up front, with a reason a user can read.
- **A registration failure is SHOWN IN THE WINDOW, not logged.** `HotkeyStatus` carries
  `registered` + a human-readable `error`; the UI renders a `Notice` with the way out. Nobody reads a log
  file — and a dictation app whose only key silently does nothing is indistinguishable from a broken one.

## Injection

- A platform trait with two strategies: synthesised keystrokes (`SendInput` / `CGEvent`) or
  clipboard-and-paste. Clipboard use is **never silent** — it is a setting, and it restores the previous
  clipboard contents afterwards.
- A failed insertion is reported to the user. Text that vanished silently is the worst possible bug in a
  dictation tool.
