// @vitest-environment node
// Tests for the UI boundary gate (ADR-APP-026): every runtime dependency is classified, and a
// primitive-only package cannot be imported outside src/components/ui/**. Runs against a temp repo —
// except the last block, which lints against the REAL config, because that half of the gate IS the
// ESLint config and testing a copy of it would prove nothing.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ESLint } from "eslint";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOUNDARY_REL,
  checkBoundary,
  dependenciesOf,
  readBoundary,
  restrictedPatterns,
  validateBoundary,
} from "./ui-boundary.mjs";

let root;

const put = (rel, content) => fs.writeFileSync(path.join(root, rel), content);
const pkg = (...deps) =>
  put(
    "package.json",
    `${JSON.stringify({ name: "x", dependencies: Object.fromEntries(deps.map((d) => [d, "1.0.0"])) }, null, 2)}\n`,
  );
const boundary = (obj) => put(BOUNDARY_REL, `${JSON.stringify(obj, null, 2)}\n`);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ui-boundary-"));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("classification completeness", () => {
  it("passes when every runtime dependency is classified", () => {
    pkg("react", "zustand", "@radix-ui/react-select");
    boundary({ viewSafe: ["react", "zustand"], primitiveOnly: ["@radix-ui/react-select"] });

    expect(checkBoundary(root).errors).toEqual([]);
  });

  // The whole point. A denylist alone only fires if whoever added the library also remembered to list
  // it — the same person, in the same commit, who was about to do the wrong thing. So the gate refuses
  // the *unclassified* dependency: `npm install`-ing a UI kit forces the decision to be made.
  it("fails on a dependency nobody classified, and names both options", () => {
    pkg("react", "some-shiny-ui-kit");
    boundary({ viewSafe: ["react"], primitiveOnly: [] });

    const { errors } = checkBoundary(root);
    expect(errors.join("\n")).toMatch(/not classified/);
    expect(errors.join("\n")).toMatch(/some-shiny-ui-kit/);
    expect(errors.join("\n")).toMatch(/viewSafe/);
    expect(errors.join("\n")).toMatch(/primitiveOnly/);
  });

  it("fails when the boundary file is missing entirely", () => {
    pkg("react");
    expect(checkBoundary(root).errors.join()).toMatch(/ui-boundary\.json is missing/);
  });

  it("fails on a package classified in both lists", () => {
    pkg("react");
    boundary({ viewSafe: ["react"], primitiveOnly: ["react"] });

    expect(checkBoundary(root).errors.join()).toMatch(/classified twice/);
  });

  it("fails on a classification for a package that is not a dependency", () => {
    pkg("react");
    boundary({ viewSafe: ["react", "ghost-package"], primitiveOnly: [] });

    expect(checkBoundary(root).errors.join()).toMatch(/not runtime dependencies.*ghost-package/s);
  });

  it("reports malformed JSON instead of silently classifying nothing", () => {
    pkg("react");
    put(BOUNDARY_REL, "{ not json\n");

    expect(checkBoundary(root).errors.join()).toMatch(/not valid JSON/);
  });

  it("keeps notes out of the classification — they are for the human reviewing it", () => {
    pkg("three");
    boundary({
      viewSafe: ["three"],
      primitiveOnly: [],
      notes: { three: "renders a WebGL scene the app authors — no stock DOM chrome" },
    });

    expect(checkBoundary(root).errors).toEqual([]);
    expect(readBoundary(root).notes.three).toMatch(/WebGL/);
  });

  // It classifies `dependencies` only — NOT because a view cannot reach a devDependency (it can: the
  // bundler resolves out of node_modules regardless of which manifest section a package sits in), but
  // because a separate rule below forbids production code from importing anything else. The old title of
  // this test asserted the false version, which is precisely the belief that left the hole open.
  it("classifies runtime dependencies only — the rule below is what keeps a devDependency out of a view", () => {
    put(
      "package.json",
      `${JSON.stringify({ name: "x", dependencies: { react: "1" }, devDependencies: { vite: "1" } }, null, 2)}\n`,
    );
    expect(dependenciesOf(root)).toEqual(["react"]);
  });
});

describe("the ESLint patterns it produces", () => {
  it("bans a primitive-only package AND its subpaths", () => {
    const [rule] = restrictedPatterns(["@radix-ui/react-select"]);

    expect(rule.group).toEqual(["@radix-ui/react-select", "@radix-ui/react-select/*"]);
    // A kit's entry point is rarely the only door in.
    expect(rule.message).toMatch(/src\/components\/ui/);
    expect(rule.message).toMatch(/ADR-APP-026/);
  });

  it("produces nothing when no package is primitive-only — the rule stays inert, not broken", () => {
    expect(restrictedPatterns([])).toEqual([]);
  });
});

describe("validateBoundary (pure)", () => {
  it("is clean when the lists exactly partition the dependencies", () => {
    const errors = validateBoundary({
      deps: ["a", "b"],
      boundary: { viewSafe: ["a"], primitiveOnly: ["b"] },
    });
    expect(errors).toEqual([]);
  });
});

// The completeness check above classifies `dependencies`. On its own that leaves a door wide open, and
// for one commit it did: a UI kit installed as a **devDependency** never appears in `dependencies`, so it
// is invisible to the check, never lands in `primitiveOnly`, gets no no-restricted-imports pattern — and
// a view imports it while `check:all` stays green. The bypass was forbidden in a briefing, i.e. in prose,
// i.e. in exactly the half that rots (rule:knowledge-handover §1).
//
// `import-x/no-extraneous-dependencies` closes it: production code under src/** may import ONLY declared
// runtime dependencies. These cases lint against the REAL eslint.config.mjs and the REAL package.json —
// testing a reconstruction of the config would prove nothing about the gate that actually runs.
// Booting the real flat config (TS parser, six plugins, the boundary check) costs seconds — so one
// instance is shared, and the block gets a timeout that matches reality instead of the 5s default. A test
// that flakes on its own start-up cost teaches people to re-run it, which is how a red gate becomes noise.
describe(
  "no package reaches a view except a declared runtime dependency",
  { timeout: 60_000 },
  () => {
    const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const EXTRANEOUS = "import-x/no-extraneous-dependencies";
    const eslint = new ESLint({ cwd: REPO });

    const lint = async (code, rel) => {
      const [res] = await eslint.lintText(code, { filePath: path.join(REPO, rel) });
      return res.messages;
    };
    const ruleIds = (messages) => messages.map((m) => m.ruleId);

    it("rejects a devDependency imported from a view — the bypass this rule exists for", async () => {
      // `vitest` is a real, installed devDependency: the resolvable case, which is the only kind a view
      // could actually import.
      const messages = await lint(
        `import { describe } from "vitest";\nexport const x = describe;\n`,
        "src/views/__fixture__.tsx",
      );

      expect(ruleIds(messages)).toContain(EXTRANEOUS);
      expect(messages.find((m) => m.ruleId === EXTRANEOUS).message).toMatch(/not devDependencies/);
    });

    it("rejects a package that is declared nowhere at all — a transitive one is still in node_modules", async () => {
      const messages = await lint(
        `import acorn from "acorn";\nexport const x = acorn;\n`,
        "src/views/__fixture__.tsx",
      );

      expect(ruleIds(messages)).toContain(EXTRANEOUS);
      expect(messages.find((m) => m.ruleId === EXTRANEOUS).message).toMatch(/should be listed/);
    });

    it("lets a declared runtime dependency through — the gate must not block the work", async () => {
      const messages = await lint(
        `import { useQuery } from "@tanstack/react-query";\nexport const x = useQuery;\n`,
        "src/views/__fixture__.tsx",
      );

      expect(ruleIds(messages)).not.toContain(EXTRANEOUS);
    });

    it("still lets a TEST import the test runner — a test is not shipped UI", async () => {
      const messages = await lint(
        `import { describe } from "vitest";\nexport const x = describe;\n`,
        "src/views/__fixture__.test.tsx",
      );

      expect(ruleIds(messages)).not.toContain(EXTRANEOUS);
    });
  },
);
