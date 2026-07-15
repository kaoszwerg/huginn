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
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
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

/** The whisper.cpp GPU backend to compile into the shipped worker for this OS (ADR-PROJ-012). */
function gpuBackend() {
  // Vendor-neutral Vulkan on Windows/Linux (NVIDIA, AMD, Intel); native Metal on macOS. The runtime
  // still falls back to the CPU when no device is present, so this never makes the app fail to run.
  return process.platform === "darwin" ? "metal" : "vulkan";
}

/**
 * Ensure the environment can build the Vulkan backend, returning the env to pass to cargo.
 *
 * whisper.cpp's CMake locates `glslc` and the loader through `VULKAN_SDK`. The SDK installer sets it
 * system-wide, but a shell opened *before* the install will not have it — so fall back to the newest
 * `C:\VulkanSDK\*`. If none exists, fail loudly with the way out rather than emitting an opaque CMake
 * error thousands of lines down.
 */
function ensureVulkanSdk(env) {
  if (process.platform !== "win32") return env; // Linux gets Vulkan from the distro's dev packages
  const hasGlslc = (dir) => dir && existsSync(join(dir, "Bin", "glslc.exe"));
  if (hasGlslc(env.VULKAN_SDK)) return env;

  const root = "C:\\VulkanSDK";
  const versions = existsSync(root)
    ? readdirSync(root)
        .filter((v) => hasGlslc(join(root, v)))
        .sort()
    : [];
  if (versions.length === 0) {
    throw new Error(
      "the Vulkan SDK is required to build the GPU worker but was not found. Install it with " +
        "`winget install KhronosGroup.VulkanSDK`, or build the worker CPU-only with HUGINN_CPU_ONLY=1.",
    );
  }
  const sdk = join(root, versions[versions.length - 1]);
  console.log(`  using Vulkan SDK: ${sdk}`);
  return { ...env, VULKAN_SDK: sdk };
}

/** Case-insensitively find the PATH key (Windows stores it as `Path`) and prepend `dir` to it. */
function prependPath(env, dir) {
  const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  return { ...env, [key]: `${dir};${env[key] ?? ""}` };
}

/**
 * The directory of a Ninja to build with, or `null` if `ninja` is already on PATH.
 *
 * The Vulkan build MUST use the Ninja generator: MSBuild's FileTracker cannot create its `.tlog` files
 * for ggml-vulkan's deeply nested `vulkan-shaders-gen` sub-build (Windows' 260-char path limit, which
 * FileTracker ignores even with long paths enabled). Ninja has no such tracker. If Ninja is not on PATH,
 * fall back to the one bundled with Visual Studio / Build Tools (located via `vswhere`).
 */
function ninjaDir(env) {
  try {
    execFileSync("ninja", ["--version"], { stdio: "ignore", shell: true, env });
    return null; // already on PATH — nothing to add
  } catch {
    /* not on PATH — look for the VS-bundled Ninja below */
  }
  const vswhere = join(
    process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  if (existsSync(vswhere)) {
    const vs = execFileSync(
      vswhere,
      ["-latest", "-products", "*", "-property", "installationPath"],
      {
        encoding: "utf8",
      },
    ).trim();
    const dir = join(vs, "Common7", "IDE", "CommonExtensions", "Microsoft", "CMake", "Ninja");
    if (vs && existsSync(join(dir, "ninja.exe"))) return dir;
  }
  throw new Error(
    "Ninja is required to build the Vulkan backend on Windows (MSBuild hits the 260-char path limit on " +
      "ggml-vulkan's nested shader build). Install it (`winget install Ninja-build.Ninja`) or through " +
      "the Visual Studio installer, or build CPU-only with HUGINN_CPU_ONLY=1.",
  );
}

/**
 * A short build directory for the Vulkan worker on Windows.
 *
 * ggml-vulkan builds `vulkan-shaders-gen` as a deeply nested sub-project, and MSVC's linker is not
 * long-path-aware — under a normal `…\src-tauri\target\…` path the nested manifest path exceeds
 * Windows' 260-char limit and the build dies with LNK1104. Building into a short root on the repo's
 * drive keeps every path well under the limit. It is deliberately separate from the gate's target dir,
 * so the CPU gate build is left untouched.
 */
function shortTargetDir() {
  return `${repoRoot.slice(0, 2)}\\hgn-worker`; // e.g. "E:\\hgn-worker"
}

/** The full Windows-Vulkan build environment: SDK + Ninja generator + a short target dir. */
function windowsGpuEnv(env) {
  env = ensureVulkanSdk(env);
  env = { ...env, CMAKE_GENERATOR: "Ninja" };
  const nd = ninjaDir(env);
  if (nd) env = prependPath(env, nd);
  if (!env.CARGO_TARGET_DIR) env = { ...env, CARGO_TARGET_DIR: shortTargetDir() };
  console.log(`  Vulkan build: generator=Ninja, target=${env.CARGO_TARGET_DIR}`);
  return env;
}

function main() {
  const triple = hostTriple();
  const suffix = triple.includes("windows") ? ".exe" : "";

  // GPU is opt-in and shipped only in the release sidecar: the debug/gate worker stays CPU-only so
  // `check:all` needs no GPU SDK (ADR-PROJ-012). HUGINN_CPU_ONLY=1 forces CPU even for a release build.
  const gpu = (release || process.argv.includes("--gpu")) && !process.env.HUGINN_CPU_ONLY;
  const backend = gpu ? gpuBackend() : null;

  console.log(
    `prepare:worker — building the ASR worker (${profile}, ${triple}, backend: ${backend ?? "cpu"})`,
  );
  const args = ["build", "--locked", "--manifest-path", manifest, "-p", "huginn-asr-worker"];
  if (release) args.splice(1, 0, "--release");
  if (backend) args.push("--features", backend);

  let env = process.env;
  if (backend === "vulkan") {
    env = process.platform === "win32" ? windowsGpuEnv(env) : ensureVulkanSdk(env);
  }
  execFileSync("cargo", args, { stdio: "inherit", shell: true, env });

  // The build honours CARGO_TARGET_DIR (the Vulkan build on Windows redirects it to a short path), so
  // the sidecar is read from wherever cargo actually put it — not a hard-coded target path.
  const targetDir = env.CARGO_TARGET_DIR || join(repoRoot, "src-tauri", "target");
  const built = join(targetDir, profile, `huginn-asr-worker${suffix}`);
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
