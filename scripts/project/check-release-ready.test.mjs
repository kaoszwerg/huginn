// @vitest-environment node
// Tests for the release-blocker gate (ADR-PROJ-002). It guards the one thing that must not happen by
// accident — shipping while the publisher, the Apple account, the licence, the trademark check or the
// design system are still open — so it carries the same test obligation as production code
// (rule:testing). Everything runs against a temp repo, never the live one.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readBlockers, decide, BLOCKERS_REL, ESCAPE_ENV } from "./check-release-ready.mjs";

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "huginn-blockers-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const write = (blockers) =>
  fs.writeFileSync(path.join(root, BLOCKERS_REL), JSON.stringify({ blockers }, null, 2));

const OPEN = { id: "publisher", title: "Decide the publisher", resolved: false, resolution: null };
const CLOSED = {
  id: "licence",
  title: "Decide the licence",
  resolved: true,
  resolution: "MIT OR Apache-2.0, decided 2026-07-13.",
};

describe("the release gate", () => {
  it("reports an open blocker", () => {
    write([OPEN, CLOSED]);
    const { open, errors } = readBlockers(root);
    expect(errors).toEqual([]);
    expect(open.map((b) => b.id)).toEqual(["publisher"]);
  });

  it("is clear only when every blocker is resolved", () => {
    write([CLOSED]);
    const { open, errors } = readBlockers(root);
    expect(errors).toEqual([]);
    expect(open).toEqual([]);
  });

  it("refuses a resolved blocker that records no decision — closing it must say WHAT was decided", () => {
    write([{ id: "licence", title: "Decide the licence", resolved: true, resolution: "  " }]);
    const { errors } = readBlockers(root);
    expect(errors.join("\n")).toMatch(/marked resolved but has no "resolution"/);
  });

  it("treats a MISSING list as an error, never as 'nothing is blocking'", () => {
    const { errors } = readBlockers(root);
    expect(errors.join("\n")).toMatch(/missing/i);
    expect(errors.join("\n")).toMatch(/cannot be cleared by deleting the list/);
  });

  it("reports malformed JSON instead of silently clearing the release", () => {
    fs.writeFileSync(path.join(root, BLOCKERS_REL), "{ not json");
    const { errors, open } = readBlockers(root);
    expect(errors.join("\n")).toMatch(/not valid JSON/);
    expect(open).toEqual([]);
  });

  it("demands the fields it needs instead of guessing them", () => {
    write([{ id: "x" }]);
    const { errors } = readBlockers(root);
    expect(errors.join("\n")).toMatch(/has no "title"/);
    expect(errors.join("\n")).toMatch(/needs "resolved"/);
  });
});

describe("the verdict", () => {
  it("blocks the build while anything is open", () => {
    expect(decide({ errors: [], open: [OPEN], escape: false })).toEqual({
      code: 1,
      mode: "blocked",
    });
  });

  it("clears the build when nothing is open", () => {
    expect(decide({ errors: [], open: [], escape: false })).toEqual({ code: 0, mode: "clear" });
  });

  it("lets an explicitly-declared test build through — loudly, and only for OPEN blockers", () => {
    expect(decide({ errors: [], open: [OPEN], escape: true })).toEqual({ code: 0, mode: "escape" });
  });

  it("does NOT let the escape hatch past a malformed list — a broken gate is not a test build", () => {
    expect(decide({ errors: ["boom"], open: [], escape: true })).toEqual({
      code: 1,
      mode: "malformed",
    });
  });
});

describe("this repo, for real", () => {
  const repo = path.resolve(import.meta.dirname, "..", "..");

  it("has a well-formed release-blockers.json — a typo here would silently clear a release", () => {
    const { errors, blockers } = readBlockers(repo);
    expect(errors).toEqual([]);
    expect(blockers.length).toBeGreaterThan(0);
  });

  // The gate is only a gate because `tauri build` runs it — locally AND in the tag-triggered CI release,
  // both of which go through `beforeBuildCommand`. Pin that wiring: removing it would disarm the release
  // gate while every test still passed, which is exactly the kind of silent regression the gate exists
  // to prevent (rule:testing — the gate itself is tested).
  it("wires the gate into tauri's beforeBuildCommand, the one path every bundled build takes", () => {
    const conf = JSON.parse(fs.readFileSync(path.join(repo, "src-tauri/tauri.conf.json"), "utf8"));
    expect(conf.build.beforeBuildCommand).toContain("release:check");
  });

  it("keeps the dev path free of the gate — a blocker must not stop development", () => {
    const dev = JSON.parse(
      fs.readFileSync(path.join(repo, "src-tauri/tauri.dev.conf.json"), "utf8"),
    );
    expect(JSON.stringify(dev)).not.toContain("release:check");
    const conf = JSON.parse(fs.readFileSync(path.join(repo, "src-tauri/tauri.conf.json"), "utf8"));
    expect(conf.build.beforeDevCommand).not.toContain("release:check");
  });

  it("names the escape hatch in the message that fires — the error teaches the way out in-band", () => {
    const src = fs.readFileSync(path.join(repo, "scripts/project/check-release-ready.mjs"), "utf8");
    expect(src).toContain(ESCAPE_ENV);
  });
});
