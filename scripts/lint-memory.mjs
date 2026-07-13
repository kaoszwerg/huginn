#!/usr/bin/env node
// Validate the repo-resident memory schema and MEMORY.md consistency (ADR-CORE-003).
// Exits non-zero on any problem; runs in check:all and CI.
import fs from "node:fs";
import path from "node:path";
import { loadMemory, validateCommon, MEMORY_DIR } from "./lib/governance.mjs";

const MEMORY_TYPES = ["project", "feedback", "reference", "user"];
const errors = [];
const memos = loadMemory();

for (const d of memos) {
  errors.push(...validateCommon(d, { kind: "memory" }));
  const t = d.data.type;
  if (!t || !MEMORY_TYPES.includes(t)) {
    errors.push(`${d.rel}: invalid/missing type (expected ${MEMORY_TYPES.join("|")})`);
  }
  if (t === "feedback" || t === "project") {
    if (!/\*\*Why:\*\*/.test(d.body)) errors.push(`${d.rel}: ${t} memory missing '**Why:**'`);
    if (!/\*\*How to apply:\*\*/.test(d.body)) {
      errors.push(`${d.rel}: ${t} memory missing '**How to apply:**'`);
    }
  }
}

// MEMORY.md must link every entry, with no orphans / dead links.
const indexPath = path.join(MEMORY_DIR, "MEMORY.md");
if (!fs.existsSync(indexPath)) {
  errors.push("MEMORY.md missing — run `npm run governance:sync`");
} else {
  const idx = fs.readFileSync(indexPath, "utf8");
  const linked = new Set([...idx.matchAll(/\]\(([^)]+\.md)\)/g)].map((m) => m[1]));
  for (const d of memos) {
    const base = path.basename(d.rel);
    if (!linked.has(base))
      errors.push(`MEMORY.md does not link ${base} — run \`npm run governance:sync\``);
  }
  for (const link of linked) {
    if (!fs.existsSync(path.join(MEMORY_DIR, link))) errors.push(`MEMORY.md: dead link -> ${link}`);
  }
}

if (errors.length) {
  console.error("lint-memory FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`lint-memory OK — ${memos.length} memory files valid.`);
