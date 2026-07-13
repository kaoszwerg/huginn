// @vitest-environment node
// Front-matter validation, including the reachability contract (rule:knowledge-handover, ADR-006):
// a document nobody can load is not knowledge, it is a comment.
import { describe, it, expect } from "vitest";
import { validateCommon } from "./governance.mjs";

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
