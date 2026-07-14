// Build the ASR worker sidecar and stage it where Tauri's `externalBin` expects it, so the build
// bundles it **next to the main executable** — which is where `worker.rs` resolves it (ADR-PROJ-005).
//
// Tauri validates `externalBin` at compile time, so the staged binary must exist before the app crate
// is compiled. This runs in the release `beforeBuildCommand` (`--release`, the optimised worker that
// ships) and in `check:all` / `gen:types` (default: the debug worker, which `cargo … --workspace`
// builds anyway, so it is nearly free — those steps only need the file to exist, not to be optimised).
// `tauri dev` sets `externalBin: []`, so development needs none of this: it runs the worker straight
// from the Cargo target directory.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const manifest = join(repoRoot, "src-tauri", "Cargo.toml");
const release = process.argv.includes("--release");
const profile = release ? "release" : "debug";

/** The host target triple — Tauri names an externalBin `<name>-<triple>` (plus `.exe` on Windows). */
function hostTriple() {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8", shell: true });
  const m = out.match(/^host:\s*(\S+)/m);
  if (!m) throw new Error("could not read the host target triple from `rustc -vV`");
  return m[1];
}

function main() {
  const triple = hostTriple();
  const suffix = triple.includes("windows") ? ".exe" : "";

  console.log(`prepare:worker — building the ASR worker (${profile}, ${triple})`);
  const args = ["build", "--locked", "--manifest-path", manifest, "-p", "huginn-asr-worker"];
  if (release) args.splice(1, 0, "--release");
  execFileSync("cargo", args, { stdio: "inherit", shell: true });

  const built = join(repoRoot, "src-tauri", "target", profile, `huginn-asr-worker${suffix}`);
  if (!existsSync(built)) throw new Error(`the worker binary is missing after the build: ${built}`);

  const binDir = join(repoRoot, "src-tauri", "binaries");
  mkdirSync(binDir, { recursive: true });
  const dest = join(binDir, `huginn-asr-worker-${triple}${suffix}`);
  copyFileSync(built, dest);
  console.log(`  staged sidecar (${profile}): ${dest}`);
}

try {
  main();
} catch (e) {
  console.error(`prepare:worker FAILED: ${e.message}`);
  process.exit(1);
}
