#!/usr/bin/env node
// Validate governance front-matter, index freshness (regenerate-and-compare), links, and the layer
// boundaries (ADR-007, ADR-033). Exits non-zero on any problem; runs in check:all and CI.
import fs from "node:fs";
import path from "node:path";
import {
  computeArtifacts,
  validateCommon,
  collectLinks,
  collectIdRefs,
  ROOT,
  ADR_DIR,
  BLUEPRINT,
} from "./lib/governance.mjs";
import { readConfig, readManifest } from "./lib/governance-core.mjs";

const errors = [];

const { adrs, rules, memos, artifacts } = computeArtifacts();

// 1) Front-matter validation
for (const d of adrs) errors.push(...validateCommon(d, { kind: "adr" }));
for (const d of rules) errors.push(...validateCommon(d, { kind: "rule" }));
for (const d of memos) errors.push(...validateCommon(d, { kind: "memory" }));

// 2) Unique ids + valid superseded-by references.
//    Uniqueness is a LAYER gate too (ADR-033): two layers must never ship the same id, or a consumer
//    that receives both ends up with two documents claiming to be the same decision.
const adrIds = new Set(adrs.map((d) => d.data.id));
for (const docs of [adrs, rules]) {
  const seen = new Map();
  for (const d of docs) {
    if (seen.has(d.data.id)) {
      errors.push(`duplicate id ${d.data.id}: ${seen.get(d.data.id)} and ${d.rel}`);
    }
    seen.set(d.data.id, d.rel);
  }
}
for (const d of adrs) {
  const sb = d.data["superseded-by"];
  if (sb && !adrIds.has(sb)) errors.push(`${d.rel}: superseded-by '${sb}' does not exist`);
}

// 3) Index freshness — regenerate and compare
for (const { path: p, content } of artifacts) {
  const cur = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  if (cur !== content) {
    errors.push(
      `stale generated file: ${path.relative(ROOT, p)} — run \`npm run governance:sync\``,
    );
  }
}

// 4) Dead internal links in key docs + all ADRs/rules
const linkSources = [
  path.join(ROOT, "CLAUDE.md"),
  path.join(ROOT, "README.md"),
  BLUEPRINT,
  path.join(ADR_DIR, "README.md"),
  ...adrs.map((d) => d.file),
  ...rules.map((d) => d.file),
].filter((f) => fs.existsSync(f));
for (const src of linkSources) {
  for (const { target, abs } of collectLinks(src)) {
    if (!fs.existsSync(abs)) {
      errors.push(`${path.relative(ROOT, src)}: dead link -> ${target}`);
    }
  }
}

// 5) Layer acyclicity (ADR-033) — the gate that keeps the core portable.
//
//    A document may only cite documents in its own layer or a LOWER one. A core rule that cites ADR-026
//    (HUD primitives) is not a style problem: adopt that core in a project without the app layer and the
//    agent is handed a rule pointing at a decision it does not have. The core stops being portable, and
//    nothing would have said so.
//
//    Both markdown links and bare `ADR-NNN` / `rule:name` citations count — the latter are how these
//    documents actually reference each other in prose.
const manifest = readManifest(ROOT);
const config = readConfig(ROOT);
// Rank by POSITION in `layers` (lowest layer first). Dedupe by id first: rank is what decides the
// direction of the whole gate, so a manifest that repeated a layer would silently invert the hierarchy
// and start rejecting exactly what it exists to allow. Never trust the array to be clean.
const layerIds = [...new Set((manifest?.layers ?? []).map((l) => l.id))];
const layerRank = new Map(layerIds.map((id, i) => [id, i]));
// Anything not pinned is the project layer: owned here, published nowhere, so it may cite everything
// below it — and nothing may cite it.
const PROJECT = "project";
layerRank.set(PROJECT, layerRank.size);

const pinnedLayer = new Map((manifest?.files ?? []).map((f) => [f.path, f.layer ?? "core"]));
const layerOf = (doc) => pinnedLayer.get(doc.rel) ?? PROJECT;
const rankOf = (layer) => layerRank.get(layer) ?? layerRank.get(PROJECT);

const byId = new Map([...adrs, ...rules].map((d) => [String(d.data.id), d]));

if (manifest && layerRank.size > 1) {
  for (const doc of [...adrs, ...rules]) {
    const from = layerOf(doc);
    for (const ref of collectIdRefs(doc.file)) {
      const target = byId.get(ref);
      if (!target) {
        errors.push(`${doc.rel}: cites ${ref}, which does not exist`);
        continue;
      }
      const to = layerOf(target);
      if (rankOf(to) > rankOf(from)) {
        errors.push(
          `${doc.rel} (layer '${from}') cites ${ref} (layer '${to}') — a lower layer must not depend ` +
            `on a higher one. A project that adopts '${from}' without '${to}' would get a dangling rule. ` +
            `Move the stack-specific half into a companion document in '${to}' and keep the policy here.`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error("governance:check FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(
  `governance:check OK — ${adrs.length} ADRs, ${rules.length} rules, ${memos.length} memory files` +
    `${config.layer ? `; layer '${config.layer}'` : ""}.`,
);
