#!/usr/bin/env node
/**
 * Install the native toolchain whisper.cpp needs, and make the build find it.
 *
 *   npm run setup:build
 *
 * ## Why this exists
 *
 * `huginn-asr` compiles whisper.cpp from source (ADR-PROJ-005), and that needs two things Rust does
 * not bring:
 *
 *   * **CMake** — whisper.cpp's build system.
 *   * **libclang** — `bindgen` reads whisper.cpp's C headers with it to generate the Rust bindings.
 *
 * Neither is standard on a Windows machine, and a developer meeting "Unable to find libclang" has no
 * way to guess what is wanted. So the toolchain is installed here, reproducibly, into the user's own
 * directory — **no administrator rights, nothing touched outside `~/.local/tools`** — and the paths
 * are written where Cargo reads them without anyone having to remember an environment variable.
 *
 * It is idempotent: run it as often as you like.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, cpSync, rmSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const TOOLS = join(homedir(), ".local", "tools");
const CMAKE = join(TOOLS, "cmake");
const LIBCLANG = join(TOOLS, "libclang", "bin");

/** Pinned, not "latest": a build that silently changes its compiler between machines is not a build. */
const CMAKE_VERSION = "4.3.3";
const LIBCLANG_WHEEL =
  "https://files.pythonhosted.org/packages/0b/2d/3f480b1e1d31eb3d6de5e3ef641954e5c67430d5ac93b7fa7e07589576c7/libclang-18.1.1-py2.py3-none-win_amd64.whl";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", shell: true, ...opts });

/** Is a working cmake already on PATH? Then we use it and install nothing. */
function systemCmake() {
  try {
    execFileSync("cmake", ["--version"], { stdio: "ignore", shell: true });
    return true;
  } catch {
    return false;
  }
}

function installCmake() {
  if (systemCmake()) {
    console.log("cmake      · already on PATH");
    return null;
  }
  if (existsSync(join(CMAKE, "bin", "cmake.exe"))) {
    console.log(`cmake      · ${CMAKE}`);
    return join(CMAKE, "bin");
  }

  console.log(`cmake      · installing ${CMAKE_VERSION} → ${CMAKE}`);
  mkdirSync(TOOLS, { recursive: true });
  const zip = join(TOOLS, "cmake.zip");
  const url = `https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-windows-x86_64.zip`;

  run("curl", ["-sL", "-o", zip, url]);
  run("tar", ["-xf", zip, "-C", TOOLS]);
  rmSync(zip, { force: true });

  const unpacked = readdirSync(TOOLS).find((d) => d.startsWith("cmake-") && d.includes("windows"));
  if (!unpacked) throw new Error("cmake archive did not unpack as expected");
  rmSync(CMAKE, { recursive: true, force: true });
  cpSync(join(TOOLS, unpacked), CMAKE, { recursive: true });
  rmSync(join(TOOLS, unpacked), { recursive: true, force: true });

  return join(CMAKE, "bin");
}

/**
 * libclang, taken from the Python wheel rather than the 456 MB LLVM installer.
 *
 * The wheel is a ZIP holding exactly the one file bindgen needs (~25 MB), it needs no installer, and
 * it cannot half-install itself. The full LLVM distribution would be a 456 MB download and an
 * interactive installer for a single DLL.
 */
function installLibclang() {
  if (existsSync(join(LIBCLANG, "libclang.dll"))) {
    console.log(`libclang   · ${LIBCLANG}`);
    return;
  }

  console.log(`libclang   · installing → ${LIBCLANG}`);
  mkdirSync(LIBCLANG, { recursive: true });
  const work = join(TOOLS, "libclang-wheel");
  const whl = join(TOOLS, "libclang.whl");

  run("curl", ["-sL", "-o", whl, LIBCLANG_WHEEL]);
  mkdirSync(work, { recursive: true });
  run("tar", ["-xf", whl, "-C", work]);

  const dll = findFile(work, "libclang.dll");
  if (!dll) throw new Error("the wheel did not contain libclang.dll");
  cpSync(dll, join(LIBCLANG, "libclang.dll"));

  rmSync(work, { recursive: true, force: true });
  rmSync(whl, { force: true });
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(path, name);
      if (hit) return hit;
    } else if (entry.name === name) {
      return path;
    }
  }
  return null;
}

/**
 * Write the paths where **Cargo itself** reads them, so no one has to remember an environment
 * variable — and so `npm run check:all` works in a fresh shell.
 *
 * The file is git-ignored: it holds absolute paths from *this* machine, and committing it would hand
 * the next developer a build that points at a directory they do not have.
 */
function writeCargoConfig(cmakeBin) {
  // The REPO ROOT, not src-tauri/. Cargo looks for .cargo/config.toml relative to the working
  // directory it is invoked from and walks upwards — not relative to --manifest-path. Every npm
  // script runs from the repo root, so that is where the file has to be. (It was in src-tauri/ first,
  // and the build could not find libclang.)
  const dir = ".cargo";
  mkdirSync(dir, { recursive: true });

  const lines = [
    "# GENERATED by `npm run setup:build` — do not commit (it holds absolute paths from one machine).",
    "#",
    "# whisper.cpp is compiled from source (ADR-PROJ-005), which needs CMake and, for bindgen,",
    "# libclang. Cargo reads these here so the build works in any shell, without an exported variable",
    "# that everyone has to know about.",
    "[env]",
    `LIBCLANG_PATH = ${JSON.stringify(LIBCLANG)}`,
  ];
  if (cmakeBin) {
    // `CMAKE`, not `PATH`. Cargo's [env] can only *replace* a variable, never extend one — and
    // replacing PATH would cut the compiler and the linker out from under the build. The `cmake`
    // crate (which whisper-rs-sys drives) reads this variable for the executable's path, which is
    // exactly the narrow thing we need to say.
    lines.push(`CMAKE = ${JSON.stringify(join(cmakeBin, "cmake.exe"))}`);
  }

  writeFileSync(join(dir, "config.toml"), lines.join("\n") + "\n");
  console.log(`cargo env  · ${join(dir, "config.toml")}`);
}

if (platform() !== "win32") {
  console.error(
    "setup:build is Windows-only for now. On macOS: `brew install cmake llvm` (phase 1b, PLAN.md).",
  );
  process.exit(2);
}

const cmakeBin = installCmake();
installLibclang();
writeCargoConfig(cmakeBin);

console.log("\nready — whisper.cpp can now be compiled (`npm run check:all`).");
