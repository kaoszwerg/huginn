#!/usr/bin/env node
// App identity SSOT (ADR-APP-031): app.identity.json is the ONLY place the app name/identifier is edited.
// This propagates it into every derived location. Edits are value-level (formatting preserved), so
// Prettier and the identity:check gate agree. Run `identity:sync` after editing app.identity.json.
//   node scripts/sync-identity.mjs           apply
//   node scripts/sync-identity.mjs --check   verify no drift (runs in check:all)
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/governance.mjs";

const id = JSON.parse(fs.readFileSync(path.join(ROOT, "app.identity.json"), "utf8"));
const libCrate = `${id.crateName}_lib`;
const q = (v) => JSON.stringify(v);

// Replace the first `"key": "..."` value in a JSON string, preserving surrounding formatting.
const setKey = (text, key, value) =>
  text.replace(new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`), (_m, g1) => g1 + q(value));

// Replace a `NAME = "..."` string-literal value in TS.
const setConst = (text, name, value) =>
  text.replace(new RegExp(`(\\b${name}\\s*=\\s*)"[^"]*"`), (_m, g1) => g1 + q(value));

function syncCargo(t) {
  t = t.replace(/^(name\s*=\s*)"[^"]*"/m, (_m, g) => g + q(id.crateName)); // [package] name (first)
  t = t.replace(/^(description\s*=\s*)"[^"]*"/m, (_m, g) => g + q(id.description));
  t = t.replace(/^(default-run\s*=\s*)"[^"]*"/m, (_m, g) => g + q(id.binaryName));
  t = t.replace(/(\[lib\][\s\S]*?\nname\s*=\s*)"[^"]*"/, (_m, g) => g + q(libCrate));
  t = t.replace(/(\[\[bin\]\][\s\S]*?\nname\s*=\s*)"[^"]*"/, (_m, g) => g + q(id.binaryName));
  return t;
}

const targets = {
  "package.json": (t) => setKey(setKey(t, "name", id.packageName), "description", id.description),
  "src-tauri/Cargo.toml": syncCargo,
  "src-tauri/tauri.conf.json": (t) =>
    setKey(
      setKey(
        setKey(setKey(t, "productName", id.displayName), "mainBinaryName", id.binaryName),
        "identifier",
        id.identifier,
      ),
      "title",
      id.displayName,
    ),
  "src-tauri/tauri.dev.conf.json": (t) =>
    setKey(setKey(t, "productName", `${id.displayName} Dev`), "identifier", `${id.identifier}.dev`),
  "src/lib/app.ts": (t) =>
    setConst(
      setConst(setConst(t, "APP_NAME", id.displayName), "APP_TAGLINE", id.tagline),
      "APP_DESCRIPTION",
      id.description,
    ),
  "index.html": (t) => t.replace(/(<title>)[^<]*(<\/title>)/, (_m, a, b) => a + id.displayName + b),
  "src-tauri/src/main.rs": (t) => t.replace(/\b[A-Za-z_]\w*_lib::run\(\)/, `${libCrate}::run()`),
  "src-tauri/tests/contracts.rs": (t) =>
    t.replace(/\buse\s+[A-Za-z_]\w*_lib::/g, `use ${libCrate}::`),
};

const check = process.argv.includes("--check");
const drift = [];
for (const [rel, fn] of Object.entries(targets)) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const cur = fs.readFileSync(p, "utf8");
  const next = fn(cur);
  if (cur !== next) {
    if (check) {
      drift.push(rel);
    } else {
      fs.writeFileSync(p, next);
      console.log(`identity: updated ${rel}`);
    }
  }
}

if (check) {
  if (drift.length) {
    console.error(
      "identity:check FAILED — derived from app.identity.json is stale (run `npm run identity:sync`):",
    );
    for (const d of drift) console.error(`  - ${d}`);
    process.exit(1);
  }
  console.log(
    `identity:check OK — ${Object.keys(targets).length} derived locations match app.identity.json.`,
  );
} else {
  console.log("identity: sync complete. Run `npm run gen:types` if the crate name changed.");
}
