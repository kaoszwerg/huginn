#!/usr/bin/env node
// Validate governance front-matter, index freshness (regenerate-and-compare), links, and the layer
// boundaries (ADR-CORE-007, ADR-CORE-033). Exits non-zero on any problem; runs in check:all and CI.
import fs from "node:fs";
import path from "node:path";
import {
  computeArtifacts,
  validateCommon,
  collectLinks,
  collectIdRefs,
  adrLayerOf,
  prefixOfLayer,
  ADR_ID_RE,
  ROOT,
  ADR_DIR,
  BLUEPRINT,
} from "./lib/governance.mjs";
import { layerOfPath, readConfig, readManifest } from "./lib/governance-core.mjs";

const errors = [];

const { adrs, rules, memos, supersededBy, artifacts } = computeArtifacts();

// 1) Front-matter validation
for (const d of adrs) errors.push(...validateCommon(d, { kind: "adr" }));
for (const d of rules) errors.push(...validateCommon(d, { kind: "rule" }));
for (const d of memos) errors.push(...validateCommon(d, { kind: "memory" }));

// 2) Unique ids + valid superseded-by references.
//    Uniqueness is a LAYER gate too (ADR-CORE-033): two layers must never ship the same id, or a consumer
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

// 5) Layer acyclicity (ADR-CORE-033) — the gate that keeps the core portable.
//
//    A document may only cite documents in its own layer or a LOWER one. A core rule that cites ADR-APP-026
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

// An OPT-OUT does not move a document to another layer — it only changes who owns the file
// (ADR-CORE-032). Reading the layer from `files[]` alone silently reclassified every opted-out path as
// `project`, which made opt-out unusable for anything carrying a layer (a red build on the id gate, and a
// red build on the acyclicity gate the moment an upstream document cited the opted-out one). `layerOfPath`
// consults `optedOut[]` too.
const layerOf = (doc) => layerOfPath(manifest, doc.rel) ?? PROJECT;
const rankOf = (layer) => layerRank.get(layer) ?? layerRank.get(PROJECT);

const byId = new Map([...adrs, ...rules, ...memos].map((d) => [String(d.data.id), d]));

// 5a) The ADR id names its layer, and it must be telling the truth (ADR-CORE-034).
//
//     This is what a bare number could never do. It said nothing about who owns it; you had to look it up,
//     and the number blocks meant to keep the layers apart were already violated (the app layer holds
//     001/020/021/023/025/026/031, all inside the core's block). A prefix is part of the identifier, so
//     the gate can compare what a document CLAIMS with the layer that actually owns the file — and a
//     mislabelled ADR becomes a red build instead of a misleading citation everyone trusts.
for (const doc of adrs) {
  const id = String(doc.data.id);
  if (!ADR_ID_RE.test(id)) {
    errors.push(
      `${doc.rel}: malformed ADR id '${id}' — expected ADR-<LAYER>-<NNN>, e.g. ADR-CORE-004, ` +
        `ADR-APP-026, ADR-PROJ-105. The layer is part of the id (ADR-CORE-034).`,
    );
    continue;
  }
  if (!manifest) continue;
  // Compare PREFIXES, not layer names. The project layer is called `project` but prefixes its ADRs with
  // `PROJ` (ADR-CORE-034) — comparing the lowercased forms made every project ADR "claim layer 'proj'
  // while owned by layer 'project'", and the fix it suggested was to rename the id to itself. A gate that
  // fires on a correct file, and tells you to change nothing, is worse than no gate: it teaches the next
  // agent to ignore it.
  const actual = layerOf(doc);
  const claimedPrefix = ADR_ID_RE.exec(id)[1];
  const expectedPrefix = prefixOfLayer(actual);
  if (claimedPrefix !== expectedPrefix) {
    errors.push(
      `${doc.rel}: id '${id}' claims layer '${adrLayerOf(id)}', but the file is owned by layer ` +
        `'${actual}'. Rename it to ADR-${expectedPrefix}-${id.match(/\d{3}$/)?.[0]} (and its citations), ` +
        `or move the file into the layer it claims.`,
    );
  }
}

// 5b) Supersession — declared ONLY in the superseding document, and only downward-out (ADR-CORE-035).
//
//     A consumer must be able to say "this upstream decision does not apply to me" without editing the
//     upstream file, which is hash-pinned and read-only to it. The old procedure ("set status: superseded
//     and superseded-by on the OLD document") was not merely awkward across a layer boundary — it was
//     impossible, and it left every consumer to invent a workaround. So the new document declares
//     `supersedes: [<id>]`, the old file is never touched, and the generated indexes carry the result.
//
//     The DIRECTION is the invariant: a HIGHER layer may retire a lower layer's decision (a project may
//     decline an app rule), never the reverse. A core ADR retiring an app ADR would mean the portable core
//     had an opinion about a stack it must not know exists.
for (const [supersededId, superseder] of supersededBy) {
  const target = byId.get(supersededId);
  if (!target) {
    errors.push(`${superseder.rel}: supersedes '${supersededId}', which does not exist`);
    continue;
  }
  if (String(target.data.id) === String(superseder.data.id)) {
    errors.push(`${superseder.rel}: supersedes itself`);
    continue;
  }
  if (!manifest) continue;

  const from = layerOf(superseder);
  const to = layerOf(target);
  if (rankOf(from) < rankOf(to)) {
    errors.push(
      `${superseder.rel} (layer '${from}') supersedes ${supersededId} (layer '${to}') — a lower layer ` +
        `must not retire a higher layer's decision. Supersession runs the other way: a project may ` +
        `decline an app or core decision, an app layer may decline a core one, never the reverse.`,
    );
  }

  // The old file may still carry `superseded-by` (same-layer supersession often does). If it does, it
  // must agree with what the superseding document declares — two answers to "who replaced this" is how a
  // generated index quietly starts lying.
  const declared = target.data["superseded-by"];
  if (declared && String(declared) !== String(superseder.data.id)) {
    errors.push(
      `${target.rel}: its front-matter says superseded-by '${declared}', but ${superseder.data.id} ` +
        `declares it supersedes this. Supersession is declared in the SUPERSEDING document ` +
        `(ADR-CORE-035); remove the stale field or fix it.`,
    );
  }
}

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

// 6) Dead ADR citations in the CI workflows.
//
//    They cite ADRs in their headers to say *why* the pipeline is shaped the way it is — and they were
//    the one place the great ADR rename missed, because the rewrite walked markdown and code but not YAML.
//    Nothing was red: no gate looked there. A citation that resolves to nothing is a defect wherever it
//    lives (rule:documentation), so the check now looks where the miss actually happened.
const WORKFLOW_DIR = path.join(ROOT, ".github", "workflows");
if (fs.existsSync(WORKFLOW_DIR)) {
  for (const f of fs.readdirSync(WORKFLOW_DIR).filter((n) => n.endsWith(".yml"))) {
    const abs = path.join(WORKFLOW_DIR, f);
    const text = fs.readFileSync(abs, "utf8");
    for (const m of text.matchAll(/\bADR-(?:[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-)?\d{3}\b/g)) {
      if (!byId.has(m[0])) {
        errors.push(`.github/workflows/${f}: cites ${m[0]}, which does not exist`);
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
