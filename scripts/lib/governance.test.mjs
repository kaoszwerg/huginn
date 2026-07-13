// @vitest-environment node
// Front-matter validation, including the reachability contract (rule:knowledge-handover, ADR-CORE-006):
// a document nobody can load is not knowledge, it is a comment.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  validateCommon,
  adrLayerOf,
  prefixOfLayer,
  parseDoc,
  resolveSupersessions,
  effectiveStatus,
  ADR_ID_RE,
} from "./governance.mjs";

const doc = (data) => ({ rel: ".claude/rules/x.md", data });

const base = {
  id: "rule:x",
  title: "X",
  tldr: "Short summary.",
  scope: "global",
  load: "conditional",
};

describe("front-matter validation", () => {
  it("accepts a conditional doc that declares triggers", () => {
    expect(validateCommon(doc({ ...base, triggers: ["knip"] }), { kind: "rule" })).toEqual([]);
  });

  it("accepts a conditional doc that declares applies-to", () => {
    expect(validateCommon(doc({ ...base, "applies-to": ["src/**"] }), { kind: "rule" })).toEqual(
      [],
    );
  });

  it("rejects a conditional doc with no triggers and no applies-to — nothing would ever load it", () => {
    const errors = validateCommon(doc(base), { kind: "rule" });
    expect(errors.join("\n")).toMatch(/unreachable/i);
  });

  it("rejects a conditional doc whose triggers are empty", () => {
    const errors = validateCommon(doc({ ...base, triggers: [], "applies-to": [] }), {
      kind: "rule",
    });
    expect(errors.join("\n")).toMatch(/unreachable/i);
  });

  it("does not demand triggers on a core doc — it is always loaded", () => {
    expect(validateCommon(doc({ ...base, load: "core" }), { kind: "rule" })).toEqual([]);
  });

  it("does not demand triggers on an archival doc — it is loaded on demand only", () => {
    expect(validateCommon(doc({ ...base, load: "archival" }), { kind: "rule" })).toEqual([]);
  });

  it("still reports missing mandatory fields", () => {
    const errors = validateCommon(doc({ load: "core" }), { kind: "rule" });
    expect(errors.join("\n")).toMatch(/missing front-matter field 'id'/);
  });
});

// The layer lives in the ADR id (ADR-CORE-034), and the gate compares what an id CLAIMS against the layer
// that actually owns the file. That comparison is only sound if it is done on the same alphabet.
describe("layered ADR ids", () => {
  it("reads the layer off the id", () => {
    expect(adrLayerOf("ADR-CORE-004")).toBe("core");
    expect(adrLayerOf("ADR-APP-026")).toBe("app");
    expect(adrLayerOf("ADR-PROJ-105")).toBe("proj");
  });

  it("rejects a bare legacy id — it names no layer", () => {
    expect(adrLayerOf("ADR-026")).toBeNull();
    expect(ADR_ID_RE.test("ADR-026")).toBe(false);
  });

  // Found by the first real project ADR the gate saw. The project LAYER is called `project`, but it
  // PREFIXES its ADRs with `PROJ`. Comparing the lowercased forms made every correct project ADR fail
  // with "claims layer 'proj', but is owned by layer 'project'" — and the fix it suggested was to rename
  // the id to itself. A gate that fires on a correct file, and tells you to change nothing, teaches the
  // next agent to ignore it.
  it("maps the project layer to the PROJ prefix — the layer name and the prefix are not the same string", () => {
    expect(prefixOfLayer("project")).toBe("PROJ");
    expect(prefixOfLayer("core")).toBe("CORE");
    expect(prefixOfLayer("app")).toBe("APP");

    const id = "ADR-PROJ-105";
    expect(ADR_ID_RE.exec(id)[1]).toBe(prefixOfLayer("project")); // the comparison the gate makes
    expect(adrLayerOf(id)).not.toBe("project"); // …and the one it must NOT make
  });
});

// The staleness gate hashes each document's content. If that hash depends on line endings, the gate is
// green on a Windows working tree (CRLF) and red on a Linux CI runner (LF) — permanently, and invisibly
// from the maintainer's machine. It was: `docs/adr/manifest.json` was reported stale in CI on every push
// while `check:all` passed locally (rule:cross-platform).
describe("document hashing is line-ending independent", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gov-doc-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (name, eol) => {
    const body = [
      "---",
      "id: ADR-CORE-001",
      "title: X",
      "---",
      "",
      "# X",
      "",
      "Some text.",
      "",
    ].join(eol);
    const f = path.join(dir, name);
    fs.writeFileSync(f, body);
    return f;
  };

  it("hashes CRLF and LF versions of the same document identically", () => {
    const lf = parseDoc(write("lf.md", "\n"));
    const crlf = parseDoc(write("crlf.md", "\r\n"));

    expect(crlf.hash).toBe(lf.hash);
    expect(crlf.body).toBe(lf.body);
  });
});

// Cross-layer supersession (ADR-CORE-035). A consumer must be able to say "this upstream decision does
// not apply to me" WITHOUT editing the upstream file — which is hash-pinned and read-only to it. The old
// procedure demanded exactly that edit, so across a layer boundary it was not awkward, it was impossible;
// a real consumer worked around it with a parallel rule whose first paragraph said "the pinned rule does
// not apply here". The declaration now lives in the SUPERSEDING document alone.
describe("supersession is declared in the superseding document", () => {
  const doc2 = (id, extra = {}) => ({
    rel: `x/${id}.md`,
    data: { id, status: "accepted", ...extra },
  });

  it("derives who was superseded from the new document's `supersedes`", () => {
    const old = doc2("ADR-APP-020");
    const neu = doc2("ADR-PROJ-140", { supersedes: ["ADR-APP-020"] });

    const map = resolveSupersessions([old, neu]);

    expect(map.get("ADR-APP-020")).toBe(neu);
    // …and the OLD document's own front-matter was never touched to make that true.
    expect(old.data.status).toBe("accepted");
    expect(effectiveStatus(old, map)).toBe("superseded");
    expect(effectiveStatus(neu, map)).toBe("accepted");
  });

  it("works the same for rules — a project rule may retire an app rule", () => {
    const app = doc2("rule:theming");
    const proj = doc2("rule:design-system", { supersedes: ["rule:theming"] });

    const map = resolveSupersessions([app, proj]);

    expect(effectiveStatus(app, map)).toBe("superseded");
  });

  it("leaves an untouched document alone", () => {
    const map = resolveSupersessions([doc2("ADR-CORE-004")]);
    expect(map.size).toBe(0);
    expect(effectiveStatus(doc2("ADR-CORE-004"), map)).toBe("accepted");
  });

  it("accepts a list of ids in front-matter, and rejects anything else", () => {
    const reachable = { ...base, load: "core" };
    expect(
      validateCommon(doc({ ...reachable, supersedes: ["ADR-APP-020"] }), { kind: "rule" }),
    ).toEqual([]);
    expect(
      validateCommon(doc({ ...reachable, supersedes: "ADR-APP-020" }), { kind: "rule" }).join(),
    ).toMatch(/must be a list of document ids/);
  });
});
