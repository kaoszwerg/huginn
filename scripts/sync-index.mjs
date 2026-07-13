#!/usr/bin/env node
// Regenerate all governance indexes from ADR/rule/memory front-matter (ADR-007).
// Writes: docs/adr/manifest.json, docs/adr/README.md, docs/adr/current/README.md,
//         .claude/rules/INDEX.md, .claude/memory/MEMORY.md, and the blueprint AUTO-GENERATED blocks.
import fs from "node:fs";
import path from "node:path";
import { computeArtifacts, ROOT } from "./lib/governance.mjs";

const { artifacts } = computeArtifacts();
let changed = 0;
for (const { path: p, content } of artifacts) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const prev = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  if (prev !== content) {
    fs.writeFileSync(p, content);
    console.log(`  updated ${path.relative(ROOT, p)}`);
    changed++;
  }
}
console.log(
  changed
    ? `governance:sync — ${changed} file(s) updated.`
    : "governance:sync — already up to date.",
);
