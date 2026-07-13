// @vitest-environment node
// Tests for the layered governance (ADR-033, ADR-032, ADR-030): the hash pin, the drift-gate, layer
// attribution, the collision guard, the project opt-out and the upstream update. Everything runs
// against temp repos — never the real one.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyUpstream,
  checkCore,
  computeFiles,
  copyCore,
  detectCollisions,
  governedPaths,
  hashFile,
  readConfig,
  readOptOut,
  upstreamEntries,
  writeManifest,
} from "./governance-core.mjs";

let root;
let upstreamDir;

/** Write a file (creating parents) inside a repo root. */
function put(repo, rel, content) {
  const abs = path.join(repo, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function readJson(repo, rel) {
  return JSON.parse(fs.readFileSync(path.join(repo, rel), "utf8"));
}

const writeConfig = (repo, config) =>
  put(repo, "governance/config.json", `${JSON.stringify(config, null, 2)}\n`);

/** A minimal repo that exercises every governed class: config, script, rule, ADR, memory, migration. */
function seedRepo(repo) {
  put(repo, "package.json", `${JSON.stringify({ name: "x", version: "1.2.3" }, null, 2)}\n`);
  put(repo, "CLAUDE.md", "# core contract\n");
  put(repo, ".editorconfig", "root = true\n");
  put(repo, "src-tauri/deny.toml", '[licenses]\nallow = ["MIT"]\n');
  put(repo, "scripts/tool.mjs", "export const a = 1;\n");
  put(repo, ".claude/rules/core-principles.md", "# rules\n");
  put(repo, "docs/adr/001-x.md", "# adr\n");
  put(repo, ".claude/memory/glossary.md", "# glossary\n");
  put(repo, "docs/migrations/001-demo.md", "# briefing\n");
  // Project layer — must never be pinned.
  put(repo, "knip.project.json", `{ "ignore": ["src/bindings/**"] }\n`);
  put(repo, "src/main.tsx", "export default 1;\n");
  put(repo, "scripts/project/python.mjs", "export const uv = 1;\n");
}

/** Pin the current state, then mark the repo as a leaf consumer of `upstream` (pre-ADR-033 shape:
 * no governance/config.json at all — exactly what an existing fork like ivaldi looks like). */
function pinAsLeaf(repo, upstream = "acme/saga-rust-template") {
  writeManifest(repo);
  const manifest = readJson(repo, "governance/manifest.json");
  manifest.upstream = upstream;
  put(repo, "governance/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

const optOut = (repo, ...paths) =>
  put(repo, "governance/opt-out.json", `${JSON.stringify({ paths }, null, 2)}\n`);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "gov-root-"));
  upstreamDir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-upstream-"));
  seedRepo(root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(upstreamDir, { recursive: true, force: true });
});

describe("governed path collection", () => {
  it("governs config, scripts, rules, ADRs, declared memory and migrations — never the project layer", () => {
    const pinned = computeFiles(root).map((f) => f.path);

    expect(pinned).toContain("CLAUDE.md");
    expect(pinned).toContain("src-tauri/deny.toml");
    expect(pinned).toContain("scripts/tool.mjs");
    expect(pinned).toContain(".claude/rules/core-principles.md");
    expect(pinned).toContain("docs/adr/001-x.md");
    expect(pinned).toContain(".claude/memory/glossary.md");
    // Migration briefings are upstream-owned knowledge a consumer must receive on update
    // (rule:knowledge-handover) — they travel with the governance, not beside it.
    expect(pinned).toContain("docs/migrations/001-demo.md");

    // ADR-032: inherently project-specific config is NOT governed.
    expect(pinned).not.toContain("knip.project.json");
    expect(pinned).not.toContain("src/main.tsx");
    // scripts/ is governed, but scripts/project/ is the project's own tooling — reserved, never pinned,
    // so an upstream script can never collide with (and overwrite) a project script.
    expect(pinned).not.toContain("scripts/project/python.mjs");
  });

  it("hashes line-ending-independently so the pin is stable across OSes", () => {
    put(root, "CLAUDE.md", "a\nb\n");
    const lf = hashFile(root, "CLAUDE.md");
    put(root, "CLAUDE.md", "a\r\nb\r\n");
    expect(hashFile(root, "CLAUDE.md")).toBe(lf);
  });

  it("governs only the memory and config files the layer declares (ADR-033)", () => {
    writeConfig(root, {
      upstream: null,
      layer: "core",
      owns: { memory: ["glossary.md"], config: ["CLAUDE.md"] },
    });
    put(root, ".claude/memory/project-scope.md", "# project state\n");

    const governed = governedPaths(root);

    expect(governed).toContain(".claude/memory/glossary.md");
    expect(governed).toContain("CLAUDE.md");
    // Undeclared: project state, and a config file this layer does not own. Declaring them is what
    // stopped stack vocabulary from being pinned as "portable core".
    expect(governed).not.toContain(".claude/memory/project-scope.md");
    expect(governed).not.toContain("src-tauri/deny.toml");
  });

  it("keeps an excluded path out of what the layer publishes", () => {
    put(root, ".github/workflows/ci.yml", "name: ci\n");
    writeConfig(root, {
      upstream: null,
      layer: "core",
      owns: { memory: [], config: [] },
      exclude: [".github/workflows/**"],
    });

    // A repo's own CI gates that repo; publishing it would run it in every consumer.
    expect(governedPaths(root)).not.toContain(".github/workflows/ci.yml");
  });
});

describe("config (ADR-033)", () => {
  it("falls back to the legacy shape when there is no config file — a pre-ADR-033 leaf still works", () => {
    pinAsLeaf(root);
    const config = readConfig(root);

    expect(config.legacy).toBe(true);
    expect(config.upstream).toBe("acme/saga-rust-template");
    expect(config.layer).toBeNull(); // it consumes; it owns nothing
  });

  it("treats a repo with no upstream and no config as the root of the cascade", () => {
    writeManifest(root);
    expect(readConfig(root).layer).toBe("core");
    expect(checkCore(root).isRoot).toBe(true);
  });

  it("rejects 'owns' without a layer — a repo that owns no layer publishes nothing", () => {
    writeConfig(root, { upstream: "acme/althing", layer: null, owns: { config: ["CLAUDE.md"] } });
    expect(readConfig(root).errors.join()).toMatch(/owns.*but 'layer' is null/i);
  });

  it("reports a malformed config instead of silently governing nothing", () => {
    put(root, "governance/config.json", "{ not json\n");
    expect(readConfig(root).errors.join()).toMatch(/not valid JSON/);
  });
});

describe("drift-gate", () => {
  it("passes on a pinned, unmodified leaf", () => {
    pinAsLeaf(root);
    const result = checkCore(root);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.publishes).toBe(false);
  });

  it("fails when a file owned by an upstream layer is edited in place", () => {
    pinAsLeaf(root);
    put(root, "CLAUDE.md", "# tampered\n");

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/drift: CLAUDE\.md is owned by layer 'core'/);
  });

  it("fails when a file owned by an upstream layer is deleted", () => {
    pinAsLeaf(root);
    fs.rmSync(path.join(root, "CLAUDE.md"));

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(
      /missing upstream file \(layer 'core'\): CLAUDE\.md/,
    );
  });

  it("fails at the root of the cascade when a governed file is not yet pinned", () => {
    writeManifest(root); // root: no upstream, owns 'core'
    put(root, ".gitattributes", "* text=auto\n");

    const result = checkCore(root);
    expect(result.isRoot).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/unpinned file \(layer 'core'\): \.gitattributes/);
  });
});

// The cascade: althing (owns 'core') → this repo (consumes 'core', owns 'app') → a leaf.
// This is the role ADR-030's single boolean could not express.
describe("layers — consumer AND publisher (ADR-033)", () => {
  /** althing: the root of the cascade. Ships CLAUDE.md, a rule, an ADR and a script. */
  function seedAlthing(dir) {
    put(dir, "package.json", `${JSON.stringify({ name: "althing", version: "0.1.0" }, null, 2)}\n`);
    put(dir, "CLAUDE.md", "# agnostic contract\n");
    put(dir, ".claude/rules/core-principles.md", "# agnostic principles\n");
    put(dir, "docs/adr/002-best-solution.md", "# agnostic adr\n");
    put(dir, "scripts/tool.mjs", "export const a = 1;\n");
    put(dir, ".claude/memory/user-conventions.md", "# conventions\n");
    writeConfig(dir, {
      upstream: null,
      layer: "core",
      owns: { memory: ["user-conventions.md"], config: ["CLAUDE.md"] },
    });
    writeManifest(dir);
  }

  /** This repo: consumes althing's core (identical bytes) and adds its own app layer on top. */
  function seedApp(repo, upstreamPath) {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.mkdirSync(repo, { recursive: true });
    put(repo, "package.json", `${JSON.stringify({ name: "app", version: "2.0.0" }, null, 2)}\n`);
    // …the core, exactly as althing ships it
    put(repo, "CLAUDE.md", "# agnostic contract\n");
    put(repo, ".claude/rules/core-principles.md", "# agnostic principles\n");
    put(repo, "docs/adr/002-best-solution.md", "# agnostic adr\n");
    put(repo, "scripts/tool.mjs", "export const a = 1;\n");
    put(repo, ".claude/memory/user-conventions.md", "# conventions\n");
    // …plus the app layer this repo owns
    put(repo, ".claude/rules/rust-conventions.md", "# rust\n");
    put(repo, "docs/adr/020-hud.md", "# hud\n");
    put(repo, "scripts/sync-version.mjs", "export const cargo = 1;\n");
    put(repo, ".claude/memory/glossary.md", "# hud glossary\n");
    put(repo, "eslint.config.mjs", "export default [];\n");
    writeConfig(repo, {
      upstream: upstreamPath,
      layer: "app",
      owns: { memory: ["glossary.md"], config: ["eslint.config.mjs"] },
    });
    writeManifest(repo, { upstream: readJson(upstreamPath, "governance/manifest.json") });
  }

  beforeEach(() => {
    seedAlthing(upstreamDir);
    seedApp(root, upstreamDir);
  });

  it("attributes every file to a layer: upstream files to 'core', its own to 'app'", () => {
    const manifest = readJson(root, "governance/manifest.json");
    const layerOf = (p) => manifest.files.find((f) => f.path === p)?.layer;

    expect(layerOf("CLAUDE.md")).toBe("core");
    expect(layerOf(".claude/rules/core-principles.md")).toBe("core");
    expect(layerOf(".claude/rules/rust-conventions.md")).toBe("app");
    expect(layerOf("docs/adr/020-hud.md")).toBe("app");
    expect(layerOf("scripts/sync-version.mjs")).toBe("app");
    expect(layerOf(".claude/memory/glossary.md")).toBe("app");
    expect(checkCore(root).ok).toBe(true);
  });

  it("is a consumer of 'core' and a publisher of 'app' at the same time", () => {
    const result = checkCore(root);
    expect(result.publishes).toBe(true);
    expect(result.layer).toBe("app");
    expect(result.isRoot).toBe(false);
  });

  it("refuses an in-place edit of a core file, but re-pins its own app file on sync", () => {
    put(root, "CLAUDE.md", "# I edited the core\n");
    expect(checkCore(root).problems.join("\n")).toMatch(
      /drift: CLAUDE\.md is owned by layer 'core'/,
    );

    // Restore the core, change something this repo owns instead.
    put(root, "CLAUDE.md", "# agnostic contract\n");
    put(root, ".claude/rules/rust-conventions.md", "# rust, revised\n");
    expect(checkCore(root).problems.join("\n")).toMatch(
      /stale pin \(layer 'app'\): \.claude\/rules\/rust-conventions\.md/,
    );

    writeManifest(root); // = governance:sync
    expect(checkCore(root).ok).toBe(true);
  });

  it("records where each layer came from and at which version", () => {
    const { layers, governanceVersion } = readJson(root, "governance/manifest.json");

    expect(layers).toEqual([
      { id: "core", source: upstreamDir, version: "0.1.0" },
      { id: "app", source: null, version: "2.0.0" },
    ]);
    // The version this repo publishes is its OWN (the app layer's), not the core's.
    expect(governanceVersion).toBe("2.0.0");
  });

  // Found in the FIRST real cascade run, in a live fork. `layers` was rebuilt from the previous manifest
  // and then had the own layer appended again — so it grew on every `governance:sync` (a leaf ended up
  // with nine entries for two layers) and the own layer's `source: null` was rewritten to the upstream's
  // slug, claiming it came from a repo that had never heard of it. Because the acyclicity gate ranks
  // layers by their POSITION in this array, the ranks inverted and it began rejecting a project ADR for
  // citing the core — the exact opposite of the rule it enforces.
  it("keeps `layers` stable and correctly sourced across repeated syncs", () => {
    for (let i = 0; i < 3; i++) writeManifest(root); // = three `governance:sync` runs

    const { layers } = readJson(root, "governance/manifest.json");

    expect(layers).toEqual([
      { id: "core", source: upstreamDir, version: "0.1.0" },
      { id: "app", source: null, version: "2.0.0" }, // still OURS — never re-sourced to the upstream
    ]);
    expect(checkCore(root).ok).toBe(true);
  });

  it("tells a leaf which repo actually published each layer", () => {
    const leaf = fs.mkdtempSync(path.join(os.tmpdir(), "gov-leaf-"));
    try {
      put(leaf, "package.json", `${JSON.stringify({ name: "leaf", version: "9.9.9" }, null, 2)}\n`);
      writeConfig(leaf, { upstream: root, layer: null });
      writeManifest(leaf, { upstream: readJson(root, "governance/manifest.json") });

      // The leaf never talks to althing, yet it must still know the core came from there — and that the
      // app layer came from its own upstream, not from althing.
      expect(readJson(leaf, "governance/manifest.json").layers).toEqual([
        { id: "core", source: upstreamDir, version: "0.1.0" },
        { id: "app", source: root, version: "2.0.0" },
      ]);
    } finally {
      fs.rmSync(leaf, { recursive: true, force: true });
    }
  });

  // The single most destructive failure mode of the cascade. Every app-layer file is, by definition,
  // absent from althing's manifest — so a deletion pass that walks the local pin without filtering by
  // layer would delete the entire app layer on the first update.
  it("NEVER deletes its own layer when the upstream does not ship it", () => {
    put(upstreamDir, "CLAUDE.md", "# agnostic contract v2\n");
    writeManifest(upstreamDir);

    const summary = applyUpstream({
      root,
      srcDir: upstreamDir,
      upstream: readJson(upstreamDir, "governance/manifest.json"),
      local: readJson(root, "governance/manifest.json"),
      optOut: [],
    });

    expect(summary.changed).toContain("CLAUDE.md");
    expect(summary.removed).toEqual([]);
    for (const own of [
      ".claude/rules/rust-conventions.md",
      "docs/adr/020-hud.md",
      "scripts/sync-version.mjs",
      ".claude/memory/glossary.md",
      "eslint.config.mjs",
    ]) {
      expect(fs.existsSync(path.join(root, own))).toBe(true);
    }
    // …and they are still pinned, in the app layer, after the update re-wrote the manifest.
    const manifest = readJson(root, "governance/manifest.json");
    expect(manifest.files.filter((f) => f.layer === "app")).toHaveLength(5);
    expect(checkCore(root).ok).toBe(true);
  });

  it("still deletes a core file the upstream dropped", () => {
    fs.rmSync(path.join(upstreamDir, ".claude/memory/user-conventions.md"));
    writeManifest(upstreamDir);

    const summary = applyUpstream({
      root,
      srcDir: upstreamDir,
      upstream: readJson(upstreamDir, "governance/manifest.json"),
      local: readJson(root, "governance/manifest.json"),
      optOut: [],
    });

    expect(summary.removed).toContain(".claude/memory/user-conventions.md");
    expect(fs.existsSync(path.join(root, ".claude/memory/user-conventions.md"))).toBe(false);
  });

  it("refuses to apply an update that would overwrite a file this repo owns", () => {
    // althing starts shipping a script this repo already has under the same name.
    put(upstreamDir, "scripts/sync-version.mjs", "export const theirs = 1;\n");
    writeManifest(upstreamDir);

    const collisions = detectCollisions({
      local: readJson(root, "governance/manifest.json"),
      upstream: readJson(upstreamDir, "governance/manifest.json"),
      ownLayer: "app",
    });

    expect(collisions).toEqual(["scripts/sync-version.mjs"]);
  });

  it("publishes a flat files[] that the pre-ADR-033 update logic can still read", () => {
    // ivaldi runs its OWN, older copy of the update logic while fetching the new one. It iterates
    // `files[]` and uses only `path`. If this shape broke, the very update that ships the fix would fail.
    const manifest = readJson(root, "governance/manifest.json");

    expect(Array.isArray(manifest.files)).toBe(true);
    expect(manifest.upstream).toBe(upstreamDir);
    for (const f of manifest.files) {
      expect(typeof f.path).toBe("string");
      expect(typeof f.hash).toBe("string");
    }
    // A leaf receives core AND app as one set — which is exactly what it should get.
    const paths = manifest.files.map((f) => f.path);
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain("docs/adr/020-hud.md");
  });

  it("treats a manifest without layer fields as entirely upstream-owned", () => {
    const legacy = { files: [{ path: "CLAUDE.md", hash: "x" }] };
    expect(upstreamEntries(legacy, null)).toHaveLength(1);
    expect(upstreamEntries(legacy, "app")).toHaveLength(1);
  });
});

describe("project opt-out (ADR-032)", () => {
  it("lets a consumer edit an opted-out upstream file without breaking the gate", () => {
    pinAsLeaf(root);
    optOut(root, "src-tauri/deny.toml");
    put(root, "src-tauri/deny.toml", '[advisories]\nignore = ["RUSTSEC-0000-0000"]\n');

    const result = checkCore(root);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.optOut).toEqual(["src-tauri/deny.toml"]);
  });

  it("still pins every upstream file that was NOT opted out", () => {
    pinAsLeaf(root);
    optOut(root, "src-tauri/deny.toml");
    put(root, "CLAUDE.md", "# tampered\n");

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/drift: CLAUDE\.md/);
  });

  it("rejects an opt-out for a path that is not governed at all", () => {
    pinAsLeaf(root);
    optOut(root, "src/main.tsx");

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/not a governed path: src\/main\.tsx/);
  });

  it("rejects an opt-out at the root of the cascade — it owns everything it ships", () => {
    writeManifest(root);
    optOut(root, "CLAUDE.md");

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/consumers only/i);
  });

  it("reports a malformed opt-out file instead of silently ignoring it", () => {
    pinAsLeaf(root);
    put(root, "governance/opt-out.json", "{ not json\n");

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/opt-out/i);
  });

  it("treats a missing opt-out file as 'nothing opted out'", () => {
    pinAsLeaf(root);
    expect(readOptOut(root)).toEqual({ paths: [], errors: [] });
  });
});

describe("shadowing config (ADR-032)", () => {
  // knip resolves knip.json BEFORE knip.config.js, and ESLint resolves eslint.config.js before
  // eslint.config.mjs. A repo that creates one of those silently bypasses the pinned config without ever
  // drifting a hash — the gate has to catch it, or the ban is unenforceable.
  it("rejects a config file that shadows a pinned config", () => {
    put(root, "knip.config.js", "export default {};\n");
    pinAsLeaf(root);
    put(root, "knip.json", `{ "ignore": ["src/bindings/**"] }\n`);

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(/knip\.json shadows the pinned knip\.config\.js/);
    expect(result.problems.join("\n")).toMatch(/knip\.project\.json/);
  });

  it("rejects an eslint.config.js that shadows the pinned eslint.config.mjs", () => {
    put(root, "eslint.config.mjs", "export default [];\n");
    pinAsLeaf(root);
    put(root, "eslint.config.js", "module.exports = [];\n");

    const result = checkCore(root);
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toMatch(
      /eslint\.config\.js shadows the pinned eslint\.config\.mjs/,
    );
  });

  it("accepts the project overlays — they do not shadow, they extend", () => {
    put(root, "knip.config.js", "export default {};\n");
    put(root, "eslint.config.mjs", "export default [];\n");
    pinAsLeaf(root);
    put(root, "eslint.config.project.mjs", "export default [];\n");
    // knip.project.json is already seeded by seedRepo().

    expect(checkCore(root).ok).toBe(true);
  });
});

describe("governance:update", () => {
  beforeEach(() => {
    seedRepo(upstreamDir);
    put(upstreamDir, "CLAUDE.md", "# core contract v2\n");
    put(upstreamDir, "src-tauri/deny.toml", '[licenses]\nallow = ["MIT", "ISC"]\n');
    writeManifest(upstreamDir);
  });

  const run = () =>
    applyUpstream({
      root,
      srcDir: upstreamDir,
      upstream: readJson(upstreamDir, "governance/manifest.json"),
      local: readJson(root, "governance/manifest.json"),
      optOut: readOptOut(root).paths,
    });

  it("pulls upstream files into the consumer", () => {
    pinAsLeaf(root);
    const summary = run();

    expect(summary.changed).toContain("CLAUDE.md");
    expect(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8")).toBe("# core contract v2\n");
    expect(checkCore(root).ok).toBe(true);
  });

  it("never overwrites an opted-out file, and never re-pins it", () => {
    pinAsLeaf(root);
    optOut(root, "src-tauri/deny.toml");
    const mine = '[advisories]\nignore = ["RUSTSEC-0000-0000"]\n';
    put(root, "src-tauri/deny.toml", mine);

    const summary = run();

    expect(summary.skipped).toContain("src-tauri/deny.toml");
    expect(fs.readFileSync(path.join(root, "src-tauri/deny.toml"), "utf8")).toBe(mine);
    const pinned = readJson(root, "governance/manifest.json").files.map((f) => f.path);
    expect(pinned).not.toContain("src-tauri/deny.toml");
    expect(readJson(root, "governance/manifest.json").upstream).toBe("acme/saga-rust-template");
    expect(checkCore(root).ok).toBe(true);
  });

  it("removes a file that the upstream deleted", () => {
    pinAsLeaf(root);
    fs.rmSync(path.join(upstreamDir, ".editorconfig"));
    writeManifest(upstreamDir);

    const summary = run();

    expect(summary.removed).toContain(".editorconfig");
    expect(fs.existsSync(path.join(root, ".editorconfig"))).toBe(false);
  });

  // A path can leave the pin WITHOUT being deleted upstream: it is reclassified to the project layer
  // (ADR-032 did exactly this to tsconfig/vite/.prettierignore). "Unpinned" must never mean "deleted" —
  // the project keeps its file, edits and all, and simply owns it from now on.
  it("releases a path the upstream unpinned but still ships — keeps the project's own version", () => {
    pinAsLeaf(root);
    const mine = "root = true\nindent_size = 4\n";
    put(root, ".editorconfig", mine);
    const upstreamManifest = readJson(upstreamDir, "governance/manifest.json");
    upstreamManifest.files = upstreamManifest.files.filter((f) => f.path !== ".editorconfig");
    upstreamManifest.count = upstreamManifest.files.length;
    put(upstreamDir, "governance/manifest.json", `${JSON.stringify(upstreamManifest, null, 2)}\n`);

    const summary = applyUpstream({
      root,
      srcDir: upstreamDir,
      upstream: readJson(upstreamDir, "governance/manifest.json"),
      local: readJson(root, "governance/manifest.json"),
      optOut: [],
    });

    expect(summary.removed).not.toContain(".editorconfig");
    expect(summary.released).toContain(".editorconfig");
    expect(fs.readFileSync(path.join(root, ".editorconfig"), "utf8")).toBe(mine);
    const pinned = readJson(root, "governance/manifest.json").files.map((f) => f.path);
    expect(pinned).not.toContain(".editorconfig");
  });

  it("keeps an opted-out file even when the upstream deletes it — it is project-owned now", () => {
    pinAsLeaf(root);
    optOut(root, ".editorconfig");
    fs.rmSync(path.join(upstreamDir, ".editorconfig"));
    writeManifest(upstreamDir);

    const summary = run();

    expect(summary.removed).not.toContain(".editorconfig");
    expect(fs.existsSync(path.join(root, ".editorconfig"))).toBe(true);
  });

  // Bootstrap problem: governance:update runs the consumer's OWN (old) copy of this logic while it is
  // fetching the new one. A fix to the update logic would therefore land one update too late. The CLI
  // refreshes scripts/ first and re-executes; that partial copy is copyCore with a filter.
  it("copies only the filtered subset — the self-update of the governance scripts", () => {
    pinAsLeaf(root);
    put(upstreamDir, "scripts/tool.mjs", "export const a = 2;\n");
    writeManifest(upstreamDir);

    const { changed } = copyCore({
      root,
      srcDir: upstreamDir,
      upstream: readJson(upstreamDir, "governance/manifest.json"),
      optOut: [],
      filter: (p) => p.startsWith("scripts/"),
    });

    expect(changed).toEqual(["scripts/tool.mjs"]);
    expect(fs.readFileSync(path.join(root, "scripts/tool.mjs"), "utf8")).toBe(
      "export const a = 2;\n",
    );
    // Everything else is untouched by the self-update phase.
    expect(fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8")).toBe("# core contract\n");
  });

  it("never touches the project layer", () => {
    pinAsLeaf(root);
    put(upstreamDir, "knip.project.json", `{ "ignore": ["nope"] }\n`);
    put(upstreamDir, "src/main.tsx", "export default 2;\n");

    run();

    expect(fs.readFileSync(path.join(root, "knip.project.json"), "utf8")).toBe(
      `{ "ignore": ["src/bindings/**"] }\n`,
    );
    expect(fs.readFileSync(path.join(root, "src/main.tsx"), "utf8")).toBe("export default 1;\n");
  });
});
