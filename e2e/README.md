# End-to-end tests (UI / config)

These drive the **real built Huginn window** through `tauri-driver` + WebdriverIO and assert what the
webview actually renders — settings navigation, the voice-command editor. They are a **separate, local
toolchain**: they are _not_ part of `npm run check:all` (which builds nothing and stays fast), and they
do not run in CI (GitHub only builds releases — ADR-CORE-008 / rule:automation).

## What this covers — and what it deliberately does not

**Covered** (the drivable webview UI/config surface, each restoring what it changes):

- Every top-level view opens: Home, Help, Logs (with a search query).
- The settings section rail offers every section.
- **Appearance:** theme (dark / light / follow-system, verified on `<html data-theme>`), the interface
  language switch, and the UI size.
- **Background:** close-to-tray, and autostart (toggled and restored to the original OS state).
- **Speech:** the model catalogue lists, the system-default microphone and browse button are present, the
  in-app file picker opens and cancels (it is a design-system modal, not a native dialog), and the
  start/stop sound toggles.
- **Commands:** the built-in reference, the spoken-punctuation toggle, and the full add / edit / delete
  lifecycle of user commands (a macro, a line-break command).

**Not covered — and why (the real, blocked gaps):**

- **Push-to-talk, the recording overlay, text injection** — OS-level (a global hotkey, a window over
  other apps, synthesized keystrokes). WebDriver drives the webview, not the OS. Proven instead by
  `scripts/project/prove-*.ps1` and the worker pipeline test.
- **Model download** — a real ~150 MB network fetch; it needs a mock server with a known checksum to be
  deterministic. The download logic is unit-tested in `huginn-models`.
- **Importing a real model file** — the picker's open/navigate/cancel is in-webview and E2E-driven; the
  actual selection would need a real model file on the test machine, so the navigation and selection are
  unit-tested (`FilePicker.test.tsx`) and the copy/verify path in `huginn-models`. The **drop zone** is a
  native OS drag-and-drop WebDriver cannot synthesise into the webview; its filtering and hit-testing are
  unit-tested (`FileDropZone.test.tsx`).
- **Recording a new hotkey** — drivable, but avoided: it persists a real hotkey change and re-registers a
  global shortcut. The recorder's open/cancel UI is reachable; the capture itself is a side effect the
  suite does not want.
- **Window controls (minimize / maximize / close) and Quit** — they would hide or end the window the
  session is driving.

## Prerequisites

1. **A built app binary.** A debug build is fine and faster to iterate:
   ```bash
   npm ci
   npm run build
   npm run tauri build -- --debug        # or a full `npm run tauri build`
   ```
   Point `HUGINN_E2E_BINARY` at the executable if it is not at
   `src-tauri/target/release/huginn(.exe)`.
2. **`tauri-driver`:**
   ```bash
   cargo install tauri-driver --locked
   ```
3. **The platform WebDriver `tauri-driver` proxies to:**
   - **Windows:** `msedgedriver.exe` matching the installed Edge/WebView2. Pass its path in
     `HUGINN_E2E_NATIVE_DRIVER`.
   - **Linux:** `WebKitWebDriver` (package `webkit2gtk-driver`), found on `PATH`.
   - **macOS:** unsupported by `tauri-driver` today — this harness is Windows/Linux only.

## Run

```bash
npm run e2e
```

## Important: run against a disposable profile

The tests drive the real application, which reads and writes its **real settings file** under the OS
app-data directory. The voice-command test cleans up after itself, but to be safe, run against a throwaway
profile — for example the **dev channel** (`npm run app:dev` uses a separate `….dev` data directory), or
a fresh OS user. Never point the harness at a build whose settings you care about.

## Selectors

Specs select by `data-testid` (e.g. `nav-settings`, `section-commands`, `commands-add`, `rule-row`), so
they survive an interface-language change or a copy edit. Add a `data-testid` to a control when you cover
a new flow.
