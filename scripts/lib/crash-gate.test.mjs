import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkCrashGate } from "./crash-gate.mjs";

// The gate guards every commit, so it is tested like production code — against a temp fixture, never
// against the live repo (rule:testing).
let root;

const GOOD_RUST = `
pub fn run() {
    crash::install_panic_hook();
    let result = tauri::Builder::default()
        .setup(|app| { Ok(()) })
        .run(tauri::generate_context!());
    if let Err(e) = result {
        crash::fatal("startup", "The application could not start.", &format!("{e:#}"), crash::EXIT_STARTUP);
    }
}
`;

// Assembled from short lines rather than one long template literal: as a single blob this fixture trips
// the entropy heuristic in `no-secrets`, which is a false positive we fix by writing it, not by
// switching the secret scanner off (rule:code-quality — never weaken a gate).
const GOOD_UI = [
  "installGlobalCrashHandlers(showFatal);",
  "reactRoot.render(",
  "  <CrashBoundary>",
  "    <App />",
  "  </CrashBoundary>,",
  ");",
].join("\n");

const BOUNDARIES = { tasks: {} };

function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** Lay down a repo that passes, so each test can break exactly one thing. */
function scaffold({ rust = GOOD_RUST, ui = GOOD_UI, boundaries = BOUNDARIES } = {}) {
  write("src-tauri/src/lib.rs", rust);
  write("src/main.tsx", ui);
  write("crash-boundaries.json", JSON.stringify(boundaries, null, 2));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "crash-gate-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("checkCrashGate", () => {
  it("passes when both entry points are covered", () => {
    scaffold();
    expect(checkCrashGate(root).errors).toEqual([]);
  });

  it("rejects a Rust entry point with no panic hook", () => {
    scaffold({ rust: "pub fn run() { tauri::Builder::default().run(ctx); }" });
    expect(checkCrashGate(root).errors).toEqual([
      expect.stringContaining("never calls crash::install_panic_hook()"),
    ]);
  });

  it("rejects a panic hook installed after the builder", () => {
    // A panic during setup happens before this line is ever reached — the hook must come first.
    scaffold({
      rust: `pub fn run() {
        let r = tauri::Builder::default().run(ctx);
        crash::install_panic_hook();
      }`,
    });
    expect(checkCrashGate(root).errors).toEqual([
      expect.stringContaining("installs the panic hook AFTER tauri::Builder"),
    ]);
  });

  it("rejects .expect() on the builder result", () => {
    // This is the exact line the shell shipped before ADR-APP-032: a panic into a stderr that a
    // windows-subsystem binary does not have.
    scaffold({
      rust: `pub fn run() {
        crash::install_panic_hook();
        tauri::Builder::default().run(tauri::generate_context!()).expect("error while building");
      }`,
    });
    expect(checkCrashGate(root).errors).toEqual([expect.stringContaining(".expect()/.unwrap()")]);
  });

  it("rejects a UI root with no global handlers", () => {
    scaffold({ ui: "reactRoot.render(<CrashBoundary><App /></CrashBoundary>);" });
    expect(checkCrashGate(root).errors).toEqual([
      expect.stringContaining("never calls installGlobalCrashHandlers()"),
    ]);
  });

  it("rejects a UI root that does not mount the crash boundary", () => {
    scaffold({ ui: "installGlobalCrashHandlers(showFatal); reactRoot.render(<App />);" });
    expect(checkCrashGate(root).errors).toEqual([
      expect.stringContaining("does not mount the tree inside <CrashBoundary>"),
    ]);
  });

  it("rejects an undeclared background task", () => {
    scaffold({
      rust: `${GOOD_RUST}
      fn extra() { tauri::async_runtime::spawn(async move { work().await; }); }`,
    });
    expect(checkCrashGate(root).errors).toEqual([
      expect.stringContaining(
        "spawns 1 background task(s), which nothing in crash-boundaries.json",
      ),
    ]);
  });

  it("rejects a NEW task when the declared count is stale", () => {
    scaffold({
      rust: `${GOOD_RUST}
      fn a() { tauri::async_runtime::spawn(async {}); }
      fn b() { std::thread::spawn(|| {}); }`,
      boundaries: { tasks: { "src-tauri/src/lib.rs": { spawns: 1, why: "the log bridge" } } },
    });
    expect(checkCrashGate(root).errors).toEqual([
      expect.stringContaining("spawns 2 background task(s) but crash-boundaries.json declares 1"),
    ]);
  });

  it("rejects a declaration with no reason given", () => {
    scaffold({
      rust: `${GOOD_RUST}\nfn a() { tokio::spawn(async {}); }`,
      boundaries: { tasks: { "src-tauri/src/lib.rs": { spawns: 1, why: "  " } } },
    });
    expect(checkCrashGate(root).errors).toEqual([expect.stringContaining('without a "why"')]);
  });

  it("accepts a task that is declared with a reason", () => {
    scaffold({
      rust: `${GOOD_RUST}\nfn a() { tokio::spawn(async {}); }`,
      boundaries: {
        tasks: {
          "src-tauri/src/lib.rs": {
            spawns: 1,
            why: "Lagged warns and resumes; Closed ends it on shutdown.",
          },
        },
      },
    });
    expect(checkCrashGate(root).errors).toEqual([]);
  });

  it("does not count a spawn that only appears in a comment", () => {
    scaffold({
      rust: `${GOOD_RUST}\n// the old code called tokio::spawn( here — it does not any more`,
    });
    expect(checkCrashGate(root).errors).toEqual([]);
  });

  it("rejects a stale declaration for a task that no longer exists", () => {
    scaffold({ boundaries: { tasks: { "src-tauri/src/lib.rs": { spawns: 1, why: "gone" } } } });
    expect(checkCrashGate(root).errors).toEqual([
      expect.stringContaining("but there are none left"),
    ]);
  });

  it("rejects a missing or malformed boundaries file", () => {
    scaffold();
    fs.rmSync(path.join(root, "crash-boundaries.json"));
    expect(checkCrashGate(root).errors).toEqual([expect.stringContaining("is missing")]);

    fs.writeFileSync(path.join(root, "crash-boundaries.json"), "{ not json");
    expect(checkCrashGate(root).errors).toEqual([expect.stringContaining("not valid JSON")]);
  });
});
