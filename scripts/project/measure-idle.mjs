#!/usr/bin/env node
/**
 * Idle-cost measurement for the phase-1a spike (PLAN.md 1a.3).
 *
 * The question it answers: **what does Huginn cost while it does nothing** — and what does the
 * transparent overlay add on top of that? tauri#15471 reports a transparent window costing ~8x GPU
 * power on macOS for as long as it *exists*, which is the reason ADR-PROJ-004 destroys the overlay
 * after every recording. That claim is measured, not believed.
 *
 * Run it twice and compare. First the baseline, with no overlay:
 *
 *   npm run app:dev
 *   node scripts/project/measure-idle.mjs --minutes 60 --label baseline
 *
 * Then again with the overlay kept on screen — set the sticky-overlay variable documented in
 * `src-tauri/src/spike/mod.rs` (PowerShell: `$env:HUGINN_SPIKE_OVERLAY_STICKY = "1"`) before
 * starting the app:
 *
 *   npm run app:dev
 *   node scripts/project/measure-idle.mjs --minutes 60 --label with-overlay
 *
 * It measures the **whole process tree**: the WebView2 host processes are children of huginn.exe
 * and burn most of what a webview costs. Measuring only huginn.exe would produce a flattering
 * number and answer the wrong question.
 *
 * Windows only. The macOS measurement uses different counters and is taken on the Mac
 * (PLAN.md phase 1b) — it is not guessed at from here.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";

/** Process names that belong to a running Huginn: the app plus its WebView2 hosts. */
const PROCESS_NAMES = ["huginn.exe", "msedgewebview2.exe"];

/** Windows reports CPU time in 100-nanosecond ticks. */
const TICKS_PER_SECOND = 10_000_000;

/**
 * Parse argv into options. Kept pure so the defaults are testable.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {{minutes: number, intervalSeconds: number, label: string, out: string|null}}
 */
export function parseArgs(argv) {
  const opts = { minutes: 60, intervalSeconds: 10, label: "run", out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    switch (argv[i]) {
      case "--minutes":
        opts.minutes = Number(value);
        break;
      case "--interval":
        opts.intervalSeconds = Number(value);
        break;
      case "--label":
        opts.label = String(value);
        break;
      case "--out":
        opts.out = String(value);
        break;
      default:
        throw new Error(`unknown option: ${argv[i]}`);
    }
  }
  if (!Number.isFinite(opts.minutes) || opts.minutes <= 0) {
    throw new Error("--minutes must be a positive number");
  }
  if (!Number.isFinite(opts.intervalSeconds) || opts.intervalSeconds < 1) {
    throw new Error("--interval must be at least 1 second");
  }
  return opts;
}

/**
 * Read every Huginn-owned process and its cumulative CPU time.
 *
 * @returns {{pid: number, ppid: number, name: string, cpuSeconds: number, rssBytes: number}[]}
 */
function readProcesses() {
  const filter = PROCESS_NAMES.map((n) => `Name='${n}'`).join(" OR ");
  const ps = `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,ParentProcessId,Name,UserModeTime,KernelModeTime,WorkingSetSize | ConvertTo-Json -Compress`;
  const raw = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
  }).trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((r) => ({
    pid: r.ProcessId,
    ppid: r.ParentProcessId,
    name: String(r.Name).toLowerCase(),
    cpuSeconds: (Number(r.UserModeTime) + Number(r.KernelModeTime)) / TICKS_PER_SECOND,
    rssBytes: Number(r.WorkingSetSize),
  }));
}

/**
 * Keep only the processes that belong to a Huginn instance: `huginn.exe` and, transitively, the
 * WebView2 hosts it parented. A stray `msedgewebview2.exe` from another Tauri app or from Edge
 * itself must not land in our numbers.
 *
 * @param {{pid: number, ppid: number, name: string}[]} rows
 * @returns {typeof rows}
 */
export function huginnTree(rows) {
  const owned = new Set(rows.filter((r) => r.name === "huginn.exe").map((r) => r.pid));
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (!owned.has(r.pid) && owned.has(r.ppid)) {
        owned.add(r.pid);
        grew = true;
      }
    }
  }
  return rows.filter((r) => owned.has(r.pid));
}

/**
 * Turn two consecutive samples into a CPU load, normalised to one core's worth of work being 100%
 * of one core — reported against the whole machine, so 100% means every core is busy.
 *
 * A process that died between samples would produce a negative delta; that is clamped to 0 rather
 * than reported as a negative load.
 *
 * @param {{at: number, cpuSeconds: number}} previous
 * @param {{at: number, cpuSeconds: number}} current
 * @param {number} cores
 * @returns {number} CPU usage in percent of the whole machine.
 */
export function cpuPercentBetween(previous, current, cores) {
  const wallSeconds = (current.at - previous.at) / 1000;
  if (wallSeconds <= 0 || cores <= 0) return 0;
  const cpuDelta = Math.max(0, current.cpuSeconds - previous.cpuSeconds);
  return (cpuDelta / (wallSeconds * cores)) * 100;
}

/**
 * Reduce the samples to the numbers that decide the ADR.
 *
 * @param {{at: number, cpuSeconds: number, rssBytes: number, processes: number}[]} samples
 * @param {number} cores
 */
export function summarise(samples, cores) {
  if (samples.length < 2) {
    return { samples: samples.length, insufficient: true };
  }
  const loads = [];
  for (let i = 1; i < samples.length; i += 1) {
    loads.push(cpuPercentBetween(samples[i - 1], samples[i], cores));
  }
  const sorted = [...loads].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length;

  const durationSeconds = (samples.at(-1).at - samples[0].at) / 1000;
  const cpuSecondsUsed = samples.at(-1).cpuSeconds - samples[0].cpuSeconds;

  return {
    samples: samples.length,
    durationMinutes: Number((durationSeconds / 60).toFixed(1)),
    cores,
    cpuPercentMedian: Number(median.toFixed(3)),
    cpuPercentMean: Number(mean.toFixed(3)),
    cpuPercentMax: Number(Math.max(...loads).toFixed(3)),
    // The honest headline number: how much CPU time the app burned for doing nothing at all.
    cpuSecondsPerHour: Number(((cpuSecondsUsed / durationSeconds) * 3600).toFixed(1)),
    rssMaxMb: Number((Math.max(...samples.map((s) => s.rssBytes)) / 1024 / 1024).toFixed(1)),
    processesSeen: Math.max(...samples.map((s) => s.processes)),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (process.platform !== "win32") {
    console.error(
      "measure-idle is Windows-only. The macOS idle/GPU measurement is taken on the Mac with its own counters (PLAN.md phase 1b) — it is not extrapolated from here.",
    );
    process.exit(2);
  }

  const opts = parseArgs(process.argv.slice(2));
  const cores = availableParallelism();
  const deadline = Date.now() + opts.minutes * 60_000;

  console.log(
    `measuring "${opts.label}": ${opts.minutes} min, sample every ${opts.intervalSeconds}s, ${cores} cores`,
  );
  console.log("(start the app first; Ctrl-C writes nothing — let it finish)\n");

  /** @type {{at: number, cpuSeconds: number, rssBytes: number, processes: number}[]} */
  const samples = [];

  while (Date.now() < deadline) {
    const tree = huginnTree(readProcesses());
    if (tree.length === 0) {
      console.error("no huginn.exe running — start the app, then run this again");
      process.exit(1);
    }
    const sample = {
      at: Date.now(),
      cpuSeconds: tree.reduce((a, p) => a + p.cpuSeconds, 0),
      rssBytes: tree.reduce((a, p) => a + p.rssBytes, 0),
      processes: tree.length,
    };
    samples.push(sample);

    if (samples.length > 1) {
      const load = cpuPercentBetween(samples.at(-2), sample, cores);
      const minutesLeft = Math.max(0, (deadline - Date.now()) / 60_000);
      process.stdout.write(
        `\r${samples.length} samples | cpu ${load.toFixed(2)}% | rss ${(sample.rssBytes / 1024 / 1024).toFixed(0)} MB | ${minutesLeft.toFixed(0)} min left   `,
      );
    }
    await sleep(opts.intervalSeconds * 1000);
  }

  const summary = summarise(samples, cores);
  console.log("\n");
  console.table(summary);

  const out = opts.out ?? `docs/measurements/idle-${opts.label}.json`;
  const target = resolve(process.cwd(), out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ label: opts.label, summary, samples }, null, 2)}\n`);
  console.log(`written: ${out}`);
}

// Only run when invoked directly, so the pure helpers above can be unit-tested.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  await main();
}
