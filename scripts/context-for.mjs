#!/usr/bin/env node
// Deterministically resolve which ADRs/rules an agent should load for a task (ADR-CORE-006).
// Usage: node scripts/context-for.mjs "<keywords>" [file ...]
//   - always lists load:core docs
//   - lists conditional docs whose triggers match a keyword OR whose applies-to glob matches a file
//   - NEVER lists a superseded doc — it names what replaced it instead (ADR-CORE-035)
import { loadAdrs, loadMemory, loadRules, resolveSupersessions } from "./lib/governance.mjs";

const args = process.argv.slice(2);
const keywordArg = (args[0] ?? "").toLowerCase();
const keywords = keywordArg.split(/[\s,]+/).filter(Boolean);
const files = args.slice(1);

// Minimal glob matcher: supports `**` (any depth) and `*` (one path segment).
function globToRe(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
    } else if (c === "*") {
      out += "[^/]*";
    } else if (".+^${}()|[]\\".includes(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }
  return new RegExp("^" + out + "$");
}

function matches(doc) {
  if (doc.data.load === "core") return { hit: true, why: "core" };
  if (doc.data.load === "archival") return { hit: false };
  const triggers = (doc.data.triggers ?? []).map((t) => String(t).toLowerCase());
  const hitKw = keywords.find((k) => triggers.includes(k));
  if (hitKw) return { hit: true, why: `trigger:${hitKw}` };
  const globs = doc.data["applies-to"] ?? [];
  for (const g of globs) {
    const re = globToRe(g);
    const f = files.find((file) => re.test(file));
    if (f) return { hit: true, why: `applies-to:${g}` };
  }
  return { hit: false };
}

const adrs = loadAdrs();
const rules = loadRules();
// A superseded document must not be loaded — otherwise the supersession is a note in an index nobody
// reads, and the agent still acts on a decision the project has retired (ADR-CORE-035). This is the one
// place that decides what an agent actually reads, so this is where it has to be true.
const supersededBy = resolveSupersessions([...adrs, ...rules, ...loadMemory()]);

function report(label, docs) {
  console.log(`\n${label}:`);
  let any = false;
  for (const d of docs) {
    const m = matches(d);
    if (!m.hit) continue;
    const by = supersededBy.get(String(d.data.id));
    if (by) {
      console.log(
        `  ${d.rel}  — SUPERSEDED by ${by.data.id} (${by.rel}). Do NOT load it; load that one instead.`,
      );
      continue;
    }
    any = true;
    console.log(`  ${d.rel}  (${m.why})  — ${d.data.tldr}`);
  }
  if (!any) console.log("  (none)");
}

console.log(`context-for: keywords=[${keywords.join(", ")}] files=[${files.join(", ")}]`);
report("ADRs to load", adrs);
report("Rules to load", rules);
