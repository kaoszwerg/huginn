// @vitest-environment node
// Tests for the idle-cost measurement (PLAN.md 1a.3). The measurement decides whether a
// transparent overlay may exist outside a recording (tauri#15471), so the arithmetic that produces
// the number is held to the same standard as production code (rule:testing) — a flattering bug in
// here would settle an ADR the wrong way.
import { describe, it, expect } from "vitest";
import { parseArgs, huginnTree, cpuPercentBetween, summarise } from "./measure-idle.mjs";

describe("parseArgs", () => {
  it("defaults to a one-hour run, which is what the plan asks for", () => {
    const opts = parseArgs([]);
    expect(opts.minutes).toBe(60);
    expect(opts.intervalSeconds).toBe(10);
  });

  it("takes the label that separates baseline from with-overlay", () => {
    expect(parseArgs(["--label", "with-overlay"]).label).toBe("with-overlay");
  });

  it("refuses a run length that would measure nothing", () => {
    expect(() => parseArgs(["--minutes", "0"])).toThrow(/positive/);
    expect(() => parseArgs(["--interval", "0"])).toThrow(/at least 1 second/);
  });

  it("refuses an unknown option instead of silently ignoring it", () => {
    expect(() => parseArgs(["--minuets", "60"])).toThrow(/unknown option/);
  });
});

describe("huginnTree", () => {
  const rows = [
    { pid: 100, ppid: 1, name: "huginn.exe" },
    { pid: 200, ppid: 100, name: "msedgewebview2.exe" }, // our webview host
    { pid: 300, ppid: 200, name: "msedgewebview2.exe" }, // its renderer child
    { pid: 900, ppid: 42, name: "msedgewebview2.exe" }, // someone else's Tauri app / Edge
  ];

  it("includes the webview hosts, which is where most of the cost actually is", () => {
    const pids = huginnTree(rows).map((r) => r.pid);
    expect(pids).toContain(200);
    expect(pids).toContain(300);
  });

  it("excludes a webview process that is not ours", () => {
    expect(huginnTree(rows).map((r) => r.pid)).not.toContain(900);
  });

  it("yields nothing when the app is not running", () => {
    expect(huginnTree([{ pid: 900, ppid: 42, name: "msedgewebview2.exe" }])).toEqual([]);
  });
});

describe("cpuPercentBetween", () => {
  it("reports one fully busy core on a four-core machine as 25%", () => {
    const load = cpuPercentBetween(
      { at: 0, cpuSeconds: 0 },
      { at: 10_000, cpuSeconds: 10 },
      4, // 10 CPU-seconds in 10 wall-seconds = 1 core = 25% of four
    );
    expect(load).toBeCloseTo(25, 5);
  });

  it("reports a truly idle app as zero", () => {
    expect(cpuPercentBetween({ at: 0, cpuSeconds: 5 }, { at: 10_000, cpuSeconds: 5 }, 8)).toBe(0);
  });

  it("never reports a negative load when a process disappeared between samples", () => {
    expect(cpuPercentBetween({ at: 0, cpuSeconds: 50 }, { at: 10_000, cpuSeconds: 10 }, 8)).toBe(0);
  });

  it("does not divide by zero when two samples share a timestamp", () => {
    expect(cpuPercentBetween({ at: 5, cpuSeconds: 0 }, { at: 5, cpuSeconds: 1 }, 8)).toBe(0);
  });
});

describe("summarise", () => {
  it("says so instead of inventing statistics from a single sample", () => {
    expect(summarise([{ at: 0, cpuSeconds: 0, rssBytes: 0, processes: 1 }], 8)).toMatchObject({
      insufficient: true,
    });
  });

  it("reports the CPU seconds burned per hour of doing nothing", () => {
    // 6 CPU-seconds over a 60-second window -> 360 CPU-seconds per hour.
    const samples = [
      { at: 0, cpuSeconds: 0, rssBytes: 100 * 1024 * 1024, processes: 3 },
      { at: 30_000, cpuSeconds: 3, rssBytes: 120 * 1024 * 1024, processes: 3 },
      { at: 60_000, cpuSeconds: 6, rssBytes: 110 * 1024 * 1024, processes: 3 },
    ];
    const s = summarise(samples, 8);
    expect(s.cpuSecondsPerHour).toBeCloseTo(360, 1);
    expect(s.rssMaxMb).toBeCloseTo(120, 1);
    expect(s.processesSeen).toBe(3);
    expect(s.cpuPercentMedian).toBeGreaterThan(0);
  });
});
