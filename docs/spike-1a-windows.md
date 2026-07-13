# Spike 1a — the Windows line: what was measured

**Date:** 2026-07-13 · **Machine:** the maintainer's Windows 11 development machine ·
**Build:** `npm run app:dev` (debug, dev channel)

This is the report PLAN.md phase 1a asks for. It exists because the architecture rests on one claim
that could not be taken on trust: **a window can appear over another application without taking its
keyboard focus.** If that is false, Huginn has nowhere to put the text it recognises, and
ADR-PROJ-001 (Tauri) and ADR-PROJ-004 (the overlay) are reopened.

Everything below was **run**, not reasoned about. The verdicts come from
`scripts/project/prove-focus-neutrality.ps1`, which drives the real application: it opens a target
window, holds the push-to-talk key, and reads back what the target's text box actually contains.

---

## The verdict

**Focus-neutrality on Windows: PROVEN.** With one design change that the measurement forced.

```
focus BEFORE : 61920 (Huginn Spike Target)
focus DURING : 61920 (Huginn Spike Target)
focus AFTER  : 61920 (Huginn Spike Target)

=== VERDICT ===
focus kept in the target  : True
text landed in the target : True
the target now contains   : 'Huginn spike: injected without stealing focus.'
SPIKE 1a.1 PASSED
```

And from the application's own log, the same run seen from the inside:

```
INFO push-to-talk pressed        target_process=powershell.exe target_hwnd="0x61920"
INFO overlay is up and the focus stayed put   shown_ms=3 focus_kept=true
INFO push-to-talk released       hold_ms=1561 focus_kept=true now_process="powershell.exe"
INFO text injected into the focused window    events=92 inject_ms=242 focus_kept=true
DEBUG overlay hidden
```

---

## 1a.1 — The overlay must not steal the focus

### What broke, and what it cost

The obvious design — **create the overlay when the key goes down, destroy it on release**, exactly as
ADR-PROJ-004 specifies — **cannot be made focus-neutral on Windows.** The first run failed, and the
focus trace says why:

```
focus trace  step="after build (hidden)"  overlay_hwnd=0x1622e4  focus_hwnd=0x1622e4  focus_process=huginn.exe
focus trace  step="after WS_EX_NOACTIVATE"  overlay_hwnd=0x1622e4  focus_hwnd=0x1622e4  huginn.exe
ERROR SPIKE FAILED: showing the overlay moved the focus  shown_ms=158 focus_kept=false now_process="huginn.exe"
```

**The window already owns the foreground the instant `WebviewWindowBuilder::build()` returns** — built
with `.visible(false)` *and* `.focused(false)`, before a single pixel exists. `WS_EX_NOACTIVATE` set
afterwards is too late: the extended style governs activation by a **click** or by `ShowWindow`, not
the activation that *creating* the window performs.

This is not a Tauri bug to route around with a flag. `focused(false)` reaches both the window and the
webview builder (`tauri/src/webview/webview_window.rs:535`), and wry only calls `MoveFocus` when
`focused` is true (`wry/src/webview2/mod.rs:546`) — the activation happens below both.

### The change it forced

**The overlay window is built once, at startup, and then only shown and hidden.**

- Building it at startup still takes the foreground — so the foreground is handed straight back to
  the window that had it (`SetForegroundWindow`, which Windows grants only to the process that
  currently holds the foreground: us, at that instant).
- A recording then does `SetWindowPos(SWP_NOACTIVATE | SWP_SHOWWINDOW)` and, afterwards, `SW_HIDE`.
  **Neither can take the foreground.**

**This contradicts ADR-PROJ-004**, which says the overlay is *destroyed* after each recording. The
ADR is amended, not the measurement (ADR-CORE-004). What the privacy promise is actually about — the
microphone, the audio buffers, the text — is untouched: a hidden window renders nothing, receives
nothing, and holds no audio.

### The side effect, which is a win

| | overlay built per keypress | overlay built once |
| --- | --- | --- |
| time from keypress to overlay on screen | **158 ms** | **3 ms** |
| focus kept | ✗ | ✓ |

The design the measurement forced is also the one that feels instant.

---

## 1a.2 — Push-to-talk needs key-up

**Works.** `ShortcutState::Pressed` and `::Released` both fire with
`tauri-plugin-global-shortcut 2.3.2` (the version rule:overlay-and-input pins as the minimum;
earlier versions burn a core while a key is held — global-hotkey#176).

Measured hold, key-down to key-up: `hold_ms=1561` for a 1500 ms synthetic hold. The ~60 ms of
overshoot is consistent with the 50 ms `GetAsyncKeyState` polling interval Windows uses for key-up,
plus scheduling. **Imperceptible for dictation, and it is what ADR-PROJ-004 predicted.**

## The default hotkey — and why it is only a default

`Ctrl+Alt+Space` (the first candidate) **was already taken on this machine**:

```
ERROR push-to-talk is NOT armed  hotkey=Ctrl+Alt+Space
      reason=already used by another application. Pick a different combination.
```

The app came up anyway, said so, and kept running — which is the behaviour rule:overlay-and-input
demands. The default is now `Ctrl+Space` (two keys, the maintainer's call), the hotkey is
**configurable** in the settings, and a registration failure is **shown in the window**, not buried in
a log: `Notice` + the "Fix it" button that goes straight to the setting.

## The Fn key — settled, without a measurement being needed

`Code::Fn` exists in `keyboard-types`, so it *looks* bindable. It is not:
`global-hotkey 0.8.0` maps it to no platform keycode on either OS
(`platform_impl/windows/mod.rs:323` ends in `_ => return None`, answering a registration with
`FailedToRegister("Unknown VKCode for Fn")`; macOS is the same at line 518).

Huginn therefore **refuses `Fn` up front, with a reason the user can read**, rather than letting the OS
answer with an opaque error. One level below that, most laptop keyboards resolve `Fn` in firmware and
never send a scancode at all — `HUGINN_SPIKE_KEYPROBE=1` installs a diagnostic hook that logs raw
key codes (never characters) to settle that per machine, if it ever matters.

## 1a.3 — Idle cost

**Open.** The tool exists (`scripts/project/measure-idle.mjs`, measures the whole process tree
including the WebView2 hosts, which is where most of the cost is), and the switch to keep the overlay
on screen exists (`HUGINN_SPIKE_OVERLAY_STICKY=1`). The ≥ 1 h measurement PLAN.md asks for has not
been completed yet and is **not** claimed here.

What changed the question: the overlay window now *always* exists, hidden, so the number that matters
is what a hidden transparent window costs — not what a visible one costs. That is the measurement to
run.

---

## What is still open (and is not being claimed)

- **The ≥ 1 h idle/GPU measurement** (1a.3).
- **Everything macOS** (1b). Not one line of it has been run: the `NSPanel`, `CGEvent` injection, and
  whether the same "creating the window takes the focus" problem exists there. It is built and
  measured **on the Mac** (PLAN.md), and until then it is unwritten, not "probably fine".
- **A signed release build.** Everything above was measured in a debug/dev build. tauri#13415 reports
  transparency working in dev and turning opaque in a bundled DMG — the equivalent has not been ruled
  out on Windows.
