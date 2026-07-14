/**
 * End-to-end test harness for the Huginn desktop app (the UI/config surface the user asked to cover).
 *
 * It drives the **real built application window** through `tauri-driver` (a WebDriver proxy) and
 * WebdriverIO — clicking the settings rail, toggling settings, adding a voice command — and asserts what
 * the window actually renders. It covers the webview only: push-to-talk, the overlay and text injection
 * are OS-level and are covered by the PowerShell proof scripts and the worker pipeline test, not here.
 *
 * ## Prerequisites (this does NOT run in `check:all` — it is a separate, local toolchain)
 *
 * 1. A **built** app binary. Debug is fine and faster to rebuild: `npm run build && npm run tauri build
 *    --debug` (or point `HUGINN_E2E_BINARY` at any built `huginn` executable).
 * 2. `tauri-driver` on PATH: `cargo install tauri-driver --locked`.
 * 3. The platform WebDriver `tauri-driver` proxies to:
 *    - **Windows**: `msedgedriver.exe` matching the installed Edge/WebView2 — pass its path in
 *      `HUGINN_E2E_NATIVE_DRIVER` (WebView2 uses the Edge driver).
 *    - **Linux**: `WebKitWebDriver` (from `webkit2gtk-driver`).
 *    - **macOS**: `tauri-driver` has no macOS support yet — this harness is Windows/Linux only.
 *
 * Then: `npm run e2e`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The built application binary to drive. Override for a debug build or a different output path. */
const APP_BINARY =
  process.env.HUGINN_E2E_BINARY ??
  path.resolve(
    here,
    "..",
    "src-tauri",
    "target",
    "release",
    process.platform === "win32" ? "huginn.exe" : "huginn",
  );

/** The native WebDriver tauri-driver proxies to (msedgedriver on Windows). */
const NATIVE_DRIVER = process.env.HUGINN_E2E_NATIVE_DRIVER;

const TAURI_DRIVER_PORT = 4444;

let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: [path.resolve(here, "specs", "**", "*.e2e.ts")],
  maxInstances: 1,

  capabilities: [
    {
      // tauri-driver reads this vendor capability to launch and attach to the app window.
      "tauri:options": { application: APP_BINARY },
    } as WebdriverIO.Capabilities,
  ],

  hostname: "127.0.0.1",
  port: TAURI_DRIVER_PORT,
  logLevel: "warn",
  waitforTimeout: 10_000,

  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 60_000 },
  reporters: ["spec"],

  // tauri-driver is the WebDriver server; start it before the session and stop it after. It is not a
  // WDIO "service" because it is a plain child process, and keeping it explicit here keeps the one
  // moving part visible.
  onPrepare() {
    const args = ["--port", String(TAURI_DRIVER_PORT)];
    if (NATIVE_DRIVER) args.push("--native-driver", NATIVE_DRIVER);
    tauriDriver = spawn("tauri-driver", args, {
      stdio: [null, process.stdout, process.stderr],
    });
    tauriDriver.on("error", (e) => {
      throw new Error(
        `could not start tauri-driver (${e.message}). Install it with \`cargo install tauri-driver --locked\`.`,
      );
    });
  },

  onComplete() {
    tauriDriver?.kill();
  },
};
