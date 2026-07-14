# End-to-end tests (UI / config)

These drive the **real built Huginn window** through `tauri-driver` + WebdriverIO and assert what the
webview actually renders — settings navigation, the voice-command editor. They are a **separate, local
toolchain**: they are _not_ part of `npm run check:all` (which builds nothing and stays fast), and they
do not run in CI (GitHub only builds releases — ADR-CORE-008 / rule:automation).

## What this covers — and what it deliberately does not

- **Covered:** the webview UI and config flows — navigating settings, adding/removing a voice command.
- **Not covered here:** push-to-talk, the recording overlay and text injection are OS-level (a global
  hotkey, a window over other apps, synthesized keystrokes) — WebDriver drives the webview, not the OS.
  Those are proven by `scripts/project/prove-*.ps1` and the worker pipeline test.
- **The native file picker** (model import) is an OS dialog outside the webview; WebDriver cannot click
  it. Drive the `import_model` command directly if you need to cover that path.

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
