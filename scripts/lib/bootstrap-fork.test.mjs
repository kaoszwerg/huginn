// @vitest-environment node
// The bootstrap is every new project's FIRST contact with the governance. It carries the same testing
// duty as production code (rule:testing) — and it earned it: it wrote the fork marker into
// `governance/manifest.json`, a key `readConfig()` only reads when there is no config file at all, and
// then printed "marked as a fork of … (governance:update enabled)". It had done nothing.
//
// A false success is worse than a failure: the next agent believes it and builds on a lie.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { forkConfig, writeForkMarker } from "./bootstrap-fork.mjs";
import { readConfig } from "./governance-core.mjs";

let root;

const put = (rel, content) => {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

/** A fresh copy of THIS template: it carries the template's own config — publisher of the `app` layer. */
function seedTemplateCopy() {
  put("package.json", `${JSON.stringify({ name: "copy", version: "0.3.0" }, null, 2)}\n`);
  put(
    "governance/config.json",
    `${JSON.stringify(
      {
        upstream: "kaoszwerg/althing",
        layer: "app",
        owns: { memory: ["glossary.md"], config: ["eslint.config.mjs"] },
      },
      null,
      2,
    )}\n`,
  );
  put(
    "governance/manifest.json",
    `${JSON.stringify({ generated: true, upstream: "kaoszwerg/althing", files: [] }, null, 2)}\n`,
  );
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-"));
  seedTemplateCopy();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("marking a fresh copy as a consumer", () => {
  it("writes the upstream where the governance actually reads it", () => {
    const result = writeForkMarker(root, "kaoszwerg/saga-rust-template");

    expect(result.ok).toBe(true);
    // The check that would have caught the bug: ask the GOVERNANCE, not the file we just wrote.
    expect(readConfig(root).upstream).toBe("kaoszwerg/saga-rust-template");
  });

  // The second, quieter half of the bug. A copy inherits the template's `layer: "app"` and its `owns`
  // list — so it claimed to publish the very layer it had just forked, and the gate would demand it pin
  // files it has no business publishing. A new project is a LEAF.
  it("declares the copy a leaf — it consumes, it owns and publishes nothing", () => {
    expect(readConfig(root).layer).toBe("app"); // the template's role, inherited by the copy

    writeForkMarker(root, "kaoszwerg/saga-rust-template");

    const config = readConfig(root);
    expect(config.layer).toBeNull();
    expect(config.owns.memory).toEqual([]);
    expect(config.owns.config).toEqual([]);
    // …and the template's `owns` list is gone from the file, not merely ignored.
    expect(readJson("governance/config.json").owns).toBeUndefined();
  });

  it("does not touch governance/manifest.json — the manifest's `upstream` is not where this lives", () => {
    const before = readJson("governance/manifest.json");

    writeForkMarker(root, "kaoszwerg/saga-rust-template");

    expect(readJson("governance/manifest.json")).toEqual(before);
  });

  it("refuses to report success it has not verified", () => {
    const result = writeForkMarker(root, null);

    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/no upstream/);
  });

  it("produces a leaf config with no `owns` key at all", () => {
    expect(forkConfig("acme/x")).toEqual({ upstream: "acme/x", layer: null, exclude: [] });
  });
});
