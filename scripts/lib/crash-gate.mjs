// The crash gate (ADR-CORE-037, ADR-APP-032) — an entry point without a last-resort handler is a red
// build, not a review comment.
//
// ADR-CORE-037 says the core CANNOT check this: it does not know what an entry point is in this stack,
// and it may not learn (ADR-CORE-033). The app layer does know — a Tauri app has exactly two runtimes —
// so the obligation to GATE it lands here, and this is that gate.
//
// It is loaded from `eslint.config.mjs` (like the UI boundary) rather than wired as another
// `package.json` script, because `package.json` is project-owned: a consumer could simply drop the step
// from `check:all`. `npm run lint` runs in every project, always.
//
// What it enforces:
//
//   1. The Rust process entry installs the panic hook BEFORE the Tauri builder — a panic while
//      resolving the app data dir happens before logging even exists.
//   2. The Tauri builder's result is handled, not `.expect()`ed into a stderr nobody reads (the binary
//      is built with `windows_subsystem = "windows"`; there is no console).
//   3. The UI root installs the window-level handlers AND wraps the tree in the crash boundary. The
//      webview is a second entry point; the Rust hook is blind to it.
//   4. Every background task in the backend is accounted for in `crash-boundaries.json`. A task that
//      ends quietly is a silent death — the old `while let Ok(..)` log bridge was exactly that.
import fs from "node:fs";
import path from "node:path";

export const BOUNDARIES_REL = "crash-boundaries.json";

const RUST_ENTRY = "src-tauri/src/lib.rs";
const UI_ENTRY = "src/main.tsx";
const RUST_SRC = "src-tauri/src";

/** Spawning a unit of work creates an entry point: something starts running with nobody above it. */
const SPAWN_PATTERN =
  /(?:async_runtime::spawn|tokio::spawn|task::spawn_blocking|spawn_blocking|thread::spawn)\s*\(/g;

function read(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/** Every `.rs` file under the backend source tree, as repo-relative paths with `/` separators. */
function rustSources(root) {
  const base = path.join(root, RUST_SRC);
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".rs")) {
        out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  walk(base);
  return out;
}

/** Strip `//` line comments so a spawn named in a comment is not counted as a real one. */
function stripLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

function countSpawns(source) {
  const matches = stripLineComments(source).match(SPAWN_PATTERN);
  return matches ? matches.length : 0;
}

/**
 * Check the crash boundaries of this repo.
 *
 * @param {string} root repo root
 * @returns {{errors: string[]}} empty when every entry point is covered
 */
export function checkCrashGate(root) {
  const errors = [];

  // 1 + 2 — the Rust process entry.
  const rust = read(root, RUST_ENTRY);
  if (rust === null) {
    errors.push(`${RUST_ENTRY} is missing — the Rust entry point cannot be checked.`);
  } else {
    const hook = rust.indexOf("crash::install_panic_hook()");
    const builder = rust.indexOf("tauri::Builder::");
    if (hook === -1) {
      errors.push(
        `${RUST_ENTRY} never calls crash::install_panic_hook() — a panic would end the process with no log, no report and no message.`,
      );
    } else if (builder !== -1 && hook > builder) {
      errors.push(
        `${RUST_ENTRY} installs the panic hook AFTER tauri::Builder — a panic during setup (before logging exists) would still be silent. Install it first.`,
      );
    }
    if (/\.run\(\s*tauri::generate_context!\(\)\s*\)\s*\.\s*(expect|unwrap)\s*\(/.test(rust)) {
      errors.push(
        `${RUST_ENTRY} ends the builder with .expect()/.unwrap() — that panics into a stderr no release build has (windows_subsystem = "windows"). Handle the Err and call crash::fatal(..).`,
      );
    }
  }

  // 3 — the UI runtime entry.
  const ui = read(root, UI_ENTRY);
  if (ui === null) {
    errors.push(`${UI_ENTRY} is missing — the UI entry point cannot be checked.`);
  } else {
    if (!ui.includes("installGlobalCrashHandlers(")) {
      errors.push(
        `${UI_ENTRY} never calls installGlobalCrashHandlers() — an uncaught error or a rejected promise in the webview would leave the user a blank window and no record.`,
      );
    }
    if (!ui.includes("CrashBoundary")) {
      errors.push(
        `${UI_ENTRY} does not mount the tree inside <CrashBoundary> — a throw during render would blank the window silently.`,
      );
    }
  }

  // 4 — every backend background task is declared.
  const declared = readBoundaries(root);
  if (declared.error) {
    errors.push(declared.error);
  } else {
    for (const file of rustSources(root)) {
      const source = read(root, file);
      const spawns = countSpawns(source ?? "");
      const entry = declared.tasks[file];
      if (spawns === 0) {
        if (entry) {
          errors.push(
            `${BOUNDARIES_REL} declares background tasks in ${file}, but there are none left. Remove the entry.`,
          );
        }
        continue;
      }
      if (!entry) {
        errors.push(
          `${file} spawns ${spawns} background task(s), which nothing in ${BOUNDARIES_REL} accounts for. A task that ends quietly is a silent death (ADR-CORE-037): say how each one dies.`,
        );
      } else if (entry.spawns !== spawns) {
        errors.push(
          `${file} spawns ${spawns} background task(s) but ${BOUNDARIES_REL} declares ${entry.spawns}. A new task needs its own answer to "how does this one die?" — update the entry.`,
        );
      } else if (!entry.why || !entry.why.trim()) {
        errors.push(
          `${BOUNDARIES_REL} declares ${file} without a "why" — state how the task ends: what it does when its input dries up, and why that is not a silent exit.`,
        );
      }
    }
  }

  return { errors };
}

/** Read + validate `crash-boundaries.json`. Project-owned: never pinned, never delivered by an update. */
export function readBoundaries(root) {
  const raw = read(root, BOUNDARIES_REL);
  if (raw === null) return { error: `${BOUNDARIES_REL} is missing.`, tasks: {} };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `${BOUNDARIES_REL} is not valid JSON: ${e.message}`, tasks: {} };
  }
  const tasks = parsed?.tasks;
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) {
    return { error: `${BOUNDARIES_REL} needs a "tasks" object.`, tasks: {} };
  }
  return { tasks };
}
