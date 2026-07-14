// Ensure the default speech model is present as a bundle resource, so the installer can ship it and a
// fresh install works without the user downloading anything (ADR-PROJ-006, rule:model-assets).
//
// This runs in `beforeBuildCommand` for a RELEASE build only — `tauri dev` overrides the resources list
// to exclude the model (tauri.dev.conf.json), so development never needs the 147 MB file.
//
// The model's URL, SHA-256 and size are read from the Rust catalogue (the single source of truth,
// ADR-CORE-005) rather than duplicated here — so this script can never drift from what the binary
// verifies at runtime, and there is no 64-char checksum literal for the secret scanner to trip on.
// The file is verified against that SHA-256 at build time too; the runtime install re-verifies it
// against the value compiled into the signed binary before it is ever used.

import { createHash } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import https from "node:https";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const cataloguePath = join(repoRoot, "src-tauri", "crates", "huginn-models", "src", "catalogue.rs");

/** Read the default model's identity from the Rust catalogue — the one source of truth (ADR-CORE-005). */
function defaultModelFromCatalogue() {
  const src = readFileSync(cataloguePath, "utf8");
  const idMatch = src.match(/pub const DEFAULT_MODEL:\s*&str\s*=\s*"([^"]+)"/);
  if (!idMatch) throw new Error(`could not find DEFAULT_MODEL in ${cataloguePath}`);
  const id = idMatch[1];

  const anchor = src.indexOf(`id: "${id}"`);
  if (anchor < 0) throw new Error(`DEFAULT_MODEL "${id}" has no entry in the catalogue`);
  const block = src.slice(anchor, anchor + 600);

  const url = block.match(/url:\s*"([^"]+)"/)?.[1];
  const sha256 = block.match(/sha256:\s*"([a-f0-9]{64})"/)?.[1];
  const size = Number(block.match(/size_bytes:\s*([0-9_]+)/)?.[1]?.replace(/_/g, ""));
  if (!url || !sha256 || !Number.isFinite(size)) {
    throw new Error(`could not parse url/sha256/size for "${id}" from the catalogue`);
  }
  return { id, url, sha256, size };
}

function sha256OfFile(path) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(path)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

async function isValid(path, model) {
  if (!existsSync(path) || statSync(path).size !== model.size) return false;
  return (await sha256OfFile(path)) === model.sha256;
}

/** Places the app already keep a verified copy — reused to avoid re-downloading 147 MB. */
function localCaches(model) {
  const appdata = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  return ["ai.lysis.huginn", "ai.lysis.huginn.dev"].map((dir) =>
    join(appdata, dir, "models", `${model.id}.bin`),
  );
}

function download(url, out, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error("too many redirects"));
      return;
    }
    https
      .get(url, { headers: { "User-Agent": "huginn-build" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          resolve(download(new URL(res.headers.location, url).toString(), out, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const total = Number(res.headers["content-length"]) || 0;
        let done = 0;
        let lastPct = -1;
        res.on("data", (d) => {
          done += d.length;
          if (total) {
            const pct = Math.floor((done / total) * 100);
            if (pct !== lastPct && pct % 10 === 0) {
              process.stdout.write(`  ${pct}%\r`);
              lastPct = pct;
            }
          }
        });
        const file = createWriteStream(out);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  const model = defaultModelFromCatalogue();
  const destDir = join(repoRoot, "src-tauri", "resources", "models");
  const dest = join(destDir, `${model.id}.bin`);
  console.log(`prepare:model — ${model.id} (${Math.round(model.size / 1e6)} MB)`);

  if (await isValid(dest, model)) {
    console.log("  already present and verified — nothing to do.");
    return;
  }
  mkdirSync(destDir, { recursive: true });
  const part = `${dest}.part`;

  // 1) Reuse a copy the app has already downloaded and verified.
  for (const cache of localCaches(model)) {
    if (existsSync(cache) && statSync(cache).size === model.size) {
      console.log(`  copying from local cache: ${cache}`);
      copyFileSync(cache, part);
      if ((await sha256OfFile(part)) === model.sha256) {
        renameSync(part, dest);
        console.log("  verified. done.");
        return;
      }
      rmSync(part, { force: true });
      console.log("  cache copy failed verification — falling back to download.");
    }
  }

  // 2) Fetch it, HTTPS, and verify before it is accepted.
  console.log(`  downloading from ${model.url}`);
  await download(model.url, part);
  const got = await sha256OfFile(part);
  if (got !== model.sha256) {
    rmSync(part, { force: true });
    throw new Error(`checksum mismatch: expected ${model.sha256}, got ${got}`);
  }
  renameSync(part, dest);
  console.log("  downloaded and verified. done.");
}

main().catch((e) => {
  console.error(`prepare:model FAILED: ${e.message}`);
  process.exit(1);
});
