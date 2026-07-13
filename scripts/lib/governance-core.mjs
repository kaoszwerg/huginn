// Layered governance (ADR-CORE-033), config layering (ADR-CORE-032), hash pin + drift gate (ADR-CORE-030).
//
// Governance is a stack of ordered, named layers. Each layer is owned by exactly one repo:
//
//   core  — portable, stack-agnostic          (owned by althing)
//   app   — the Tauri/React/HUD desktop shell (owned by saga-rust-template)
//   …     — any further layer a repo publishes
//   project — never pinned, never published, owned outright by every repo
//
// A repo CONSUMES every layer its upstream publishes (read-only here — an in-place edit is drift), MAY
// OWN one layer of its own, and PUBLISHES the union to its own consumers. That is what makes a repo a
// consumer and a publisher at the same time (althing → saga-rust-template → ivaldi).
//
// A file's layer is DERIVED, never annotated in the file:
//   - listed in the upstream's manifest  → owned by that layer, read-only here
//   - governed but not listed upstream   → this repo's own layer (if it owns one)
// This is why no path had to move: `scripts/`, `.claude/rules/`, `docs/adr/` stay where every consumer's
// project-owned package.json already points at them.
//
// The whole policy lives here as pure, root-parameterised functions so the gate that guards every commit
// is itself testable (rule:testing). The CLIs (`governance-manifest.mjs`, `governance-update.mjs`) are
// thin wrappers that add console output and exit codes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MANIFEST_REL = "governance/manifest.json";
export const OPT_OUT_REL = "governance/opt-out.json";
export const CONFIG_REL = "governance/config.json";

/**
 * Pre-ADR-CORE-033 defaults, used ONLY when `governance/config.json` is absent.
 *
 * A leaf consumer that predates this ADR (ivaldi) has no config file and must keep behaving exactly as
 * it did before — otherwise the update that delivers the new logic is the one that breaks it. The
 * fallback below reproduces the old hardcoded lists verbatim; a repo that owns a layer declares its own
 * (`owns.memory` / `owns.config`) and never touches these.
 */
export const LEGACY_MEMORY = [
  "glossary.md",
  "user-conventions.md",
  "response-prelude.md",
  "repo-is-memory-home.md",
  "logging-contract.md",
  "version-bump-trigger.md",
  "README.md",
];

export const LEGACY_CONFIG = [
  "CLAUDE.md",
  "eslint.config.mjs",
  ".prettierrc.json",
  ".editorconfig",
  ".gitattributes",
  "commitlint.config.js",
  ".secretlintrc.json",
  ".lintstagedrc.json",
  "knip.config.js",
  "src-tauri/deny.toml",
  "deny.toml",
  ".husky/pre-commit",
  ".husky/commit-msg",
  ".husky/pre-push",
];

// A pinned config can be bypassed WITHOUT drifting its hash: the tool simply picks a higher-priority
// config file instead. knip resolves `knip.json` before `knip.config.js`; ESLint resolves
// `eslint.config.js` before `eslint.config.mjs`. A repo that creates one of these has silently replaced
// the governed config — the hash still matches, so only an explicit check catches it.
const SHADOWING_CONFIG = [
  {
    core: "knip.config.js",
    shadows: ["knip.json", "knip.jsonc", ".knip.json", ".knip.jsonc", "knip.ts", "knip.js"],
    overlay: "knip.project.json",
  },
  {
    core: "eslint.config.mjs",
    shadows: ["eslint.config.js", "eslint.config.cjs", "eslint.config.ts"],
    overlay: "eslint.config.project.mjs",
  },
];

/** The shadow check only applies while the governed file is actually present AND still pinned: a repo
 * that opted it out owns its config outright and may name it whatever the tool expects. */
const excludedOrMissing = (root, coreFile, optOut) =>
  optOut.includes(coreFile) || !fs.existsSync(path.join(root, coreFile));

/** Minimal glob → RegExp (`**` = any depth, `*` = one segment). Used only for `exclude`. */
function globToRe(glob) {
  const re = glob
    .split("/")
    .map((seg) => {
      if (seg === "**") return "(?:.*)";
      return seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    })
    .join("/")
    .replace(/\(\?:\.\*\)\//g, "(?:.*/)?");
  return new RegExp(`^${re}$`);
}

function listDir(root, rel, { ext, exclude = [], excludeDirs = [], recursive = false } = {}) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue;
      if (recursive)
        out.push(
          ...listDir(root, `${rel}/${entry.name}`, { ext, exclude, excludeDirs, recursive }),
        );
      continue;
    }
    if (exclude.includes(entry.name)) continue;
    if (ext && !entry.name.endsWith(ext)) continue;
    out.push(`${rel}/${entry.name}`);
  }
  return out;
}

/**
 * This repo's governance config (ADR-CORE-033) — project-owned, hand-written, never generated, never pulled.
 *
 *   { "upstream": "kaoszwerg/althing",   // null in the root repo of a cascade
 *     "layer": "app",                     // null in a leaf project that owns no layer
 *     "owns":  { "memory": [...], "config": [...] },
 *     "exclude": [".github/workflows/**"] }   // governed paths this repo keeps to itself
 *
 * Absent → the legacy shape is derived from the manifest, so a consumer that predates ADR-CORE-033 needs no
 * config file at all: `upstream` from the manifest, `layer = upstream ? null : "core"`.
 */
export function readConfig(root) {
  const abs = path.join(root, CONFIG_REL);
  if (!fs.existsSync(abs)) {
    const manifest = readManifest(root);
    const upstream = manifest?.upstream ?? null;
    return {
      upstream,
      layer: upstream ? null : "core",
      owns: { memory: [...LEGACY_MEMORY], config: [...LEGACY_CONFIG] },
      exclude: [],
      legacy: true,
      errors: [],
    };
  }

  const bad = (msg) => ({
    upstream: null,
    layer: null,
    owns: { memory: [], config: [] },
    exclude: [],
    legacy: false,
    errors: [`${CONFIG_REL}: ${msg}`],
  });

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    return bad(`not valid JSON: ${err.message}`);
  }

  const strOrNull = (v) => v === null || v === undefined || typeof v === "string";
  if (!strOrNull(parsed.upstream)) return bad("'upstream' must be a repo slug/URL or null.");
  if (!strOrNull(parsed.layer)) return bad("'layer' must be a layer name or null.");

  const list = (v) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) return null;
    return v.map((s) => s.trim().split("\\").join("/")).filter(Boolean);
  };
  const memory = list(parsed.owns?.memory);
  const config = list(parsed.owns?.config);
  const exclude = list(parsed.exclude);
  if (!memory || !config || !exclude) {
    return bad("'owns.memory', 'owns.config' and 'exclude' must be arrays of strings.");
  }

  // A repo that owns no layer publishes nothing — declaring what it "owns" is a contradiction the gate
  // should name, not silently ignore.
  const layer = parsed.layer ?? null;
  if (!layer && (memory.length || config.length)) {
    return bad("'owns' is set but 'layer' is null — a repo that owns no layer publishes nothing.");
  }

  return {
    upstream: parsed.upstream ?? null,
    layer,
    owns: { memory, config },
    exclude,
    legacy: false,
    errors: [],
  };
}

/**
 * Every governed path that exists in `root`, as sorted repo-relative POSIX paths.
 *
 * Rules, ADRs, migrations and `scripts/**` are DISCOVERED by scanning — they are governance by
 * construction. Memory and config files are DECLARED (`owns.*`), because neither directory is
 * exhaustively governed: a memory may be project state (`project-scope.md`), and a config file may
 * describe the project's own shape rather than a shared gate (ADR-CORE-032). Declaring them is what stopped
 * HUD vocabulary and `src-tauri/deny.toml` from being pinned as "portable core" (ADR-CORE-033).
 */
export function governedPaths(root, config = readConfig(root)) {
  const candidates = [
    ...listDir(root, ".claude/rules", { ext: ".md", exclude: ["INDEX.md"] }),
    // An ADR file is `<layer>-NNN-<slug>.md` (ADR-CORE-034); the bare `NNN-` form is the legacy shape and
    // is still recognised so a repo mid-rename does not silently drop its ADRs out of the governed set.
    ...listDir(root, "docs/adr", { ext: ".md", exclude: ["README.md"] }).filter((p) =>
      /\/(?:[a-z][a-z0-9-]*-)?\d{3}-/.test(p),
    ),
    // `scripts/` is governance-owned — EXCEPT `scripts/project/`, the reserved home for a project's own
    // tooling (ADR-CORE-032). Without that reservation a project script lives in a governed directory, where
    // a future upstream script of the same name would silently overwrite it on update.
    ...listDir(root, "scripts", { recursive: true, excludeDirs: ["project"] }),
    // Migration briefings (rule:knowledge-handover): what a consumer's agent must know and DO after a
    // change upstream. Governed, so `governance:update` delivers them into every project.
    ...listDir(root, "docs/migrations", { ext: ".md" }),
    ...listDir(root, ".github/workflows", { ext: ".yml" }),
    ...config.owns.memory.map((f) => `.claude/memory/${f}`),
    ...config.owns.config,
  ];

  const excluded = config.exclude.map(globToRe);
  const rel = new Set();
  for (const p of candidates) {
    if (excluded.some((re) => re.test(p))) continue;
    const abs = path.join(root, p);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) rel.add(p);
  }
  return [...rel].sort();
}

/** Content hash of one governed file. Line endings are normalised so the pin is stable across OSes. */
export function hashFile(root, relPosix) {
  const raw = fs.readFileSync(path.join(root, relPosix), "utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Every governed file as `[{ path, hash }]` (no layer yet — that is attribution, below). */
export function computeFiles(root, config = readConfig(root)) {
  return governedPaths(root, config).map((p) => ({ path: p, hash: hashFile(root, p) }));
}

export function readManifest(root) {
  const abs = path.join(root, MANIFEST_REL);
  return fs.existsSync(abs) ? JSON.parse(fs.readFileSync(abs, "utf8")) : null;
}

/**
 * The paths this repo does NOT own — i.e. everything a manifest attributes to a layer other than
 * `ownLayer`. A manifest written before ADR-CORE-033 has no `layer` field at all; for a leaf consumer that
 * is exactly right (it owns nothing, so every entry is upstream-owned) and the `?? null` below yields
 * it without a migration step.
 */
/**
 * The layer a governed path belongs to — `null` if the governance does not know the path at all
 * (a project's own file, which the caller treats as the project layer).
 *
 * **An opt-out does not change a document's layer.** It changes who owns the *file* — the project keeps
 * its edits and stops receiving updates (ADR-CORE-032). The *decision* still comes from the layer that
 * published it: `docs/adr/app-020-…md` is an app-layer ADR whether or not this project pinned it.
 *
 * Reading the layer only from `files[]` — which is what this did — silently reclassified every opted-out
 * path to `project`, and that single mistake made opt-out unusable for anything that carries a layer:
 *
 *   • an opted-out ADR's id claims `APP` while the gate computes `project` → ADR-CORE-034 fails;
 *   • an opted-out rule counts as `project`, so the app-layer rule that CITES it suddenly "depends on a
 *     higher layer" → the acyclicity gate fails.
 *
 * Both were reproduced on a real consumer. The layer is an identity, not a pin.
 */
export function layerOfPath(manifest, relPath) {
  if (!manifest) return null;
  const pinned = (manifest.files ?? []).find((f) => f.path === relPath);
  if (pinned) return pinned.layer ?? "core";
  const opted = (manifest.optedOut ?? []).find((o) => o.path === relPath);
  if (opted) return opted.layer ?? "core";
  return null;
}

export function upstreamEntries(manifest, ownLayer) {
  // An entry with no `layer` predates ADR-CORE-033. It came from an upstream, so it reads as `core` — which
  // is what makes a leaf consumer's existing manifest work unchanged, with no migration step.
  return (manifest?.files ?? []).filter((f) => (f.layer ?? "core") !== ownLayer);
}

/**
 * The project's opt-out list (ADR-CORE-032): upstream-owned paths this repo has taken out of the pin, so it
 * owns them outright. Project-owned and hand-written — never generated, never pulled by an update.
 * Returns `{ paths, errors }`; a malformed file yields errors rather than a silent empty list.
 */
export function readOptOut(root) {
  const abs = path.join(root, OPT_OUT_REL);
  if (!fs.existsSync(abs)) return { paths: [], errors: [] };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    return { paths: [], errors: [`${OPT_OUT_REL} is not valid JSON: ${err.message}`] };
  }
  const paths = parsed?.paths;
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) {
    return {
      paths: [],
      errors: [
        `${OPT_OUT_REL} must be {"paths": ["<governed path>", …]} — a JSON array of strings.`,
      ],
    };
  }
  return { paths: paths.map((p) => p.trim().split("\\").join("/")).filter(Boolean), errors: [] };
}

const pkgVersion = (root) =>
  JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

/**
 * The `layers` header: what this repo publishes, in order (lowest first), and where each layer came from.
 *
 * Two things here are easy to get wrong, and both were:
 *
 * 1. **Source resolution applies only to a FRESHLY FETCHED upstream manifest.** The upstream calls its
 *    own layer `source: null` ("mine"), which from here means "theirs" — so it is resolved to the
 *    upstream's slug. Applying that same mapping to the manifest we wrote *ourselves* would rewrite our
 *    OWN layer's `source: null` into the upstream's slug, and the layer would start claiming it came from
 *    a repo that has never heard of it.
 * 2. **The list is keyed by layer id, never appended to.** Re-deriving it from the previous manifest and
 *    then adding our own layer again grows the array on every single `governance:sync`. It did: a leaf
 *    ended up with nine entries for two layers, and because the acyclicity gate ranks layers by their
 *    position, the ranks inverted and the gate started rejecting a project ADR for citing the core —
 *    the exact opposite of the rule it exists to enforce.
 */
function buildLayers({ root, config, prev, upstream, upstreamSlug }) {
  let inherited;
  if (upstream) {
    inherited = (upstream.layers ?? []).map((l) => ({
      ...l,
      source: l.source ?? upstreamSlug ?? null,
    }));
    // An upstream that predates ADR-CORE-033 declares no layers — everything it ships is one inherited layer.
    if (!inherited.length) {
      inherited = [
        { id: "core", source: upstreamSlug ?? null, version: upstream.governanceVersion ?? null },
      ];
    }
  } else {
    // No fetch (`governance:sync`): reuse what we already recorded — minus our own layer, which is
    // rebuilt below at the current version.
    inherited = (prev?.layers ?? []).filter((l) => l.id !== config.layer);
  }

  const own = config.layer ? [{ id: config.layer, source: null, version: pkgVersion(root) }] : [];

  const byId = new Map();
  for (const l of [...inherited, ...own]) byId.set(l.id, l);
  return [...byId.values()];
}

/**
 * Write `governance/manifest.json`: the union of what this repo consumed and what it owns.
 *
 * - Upstream-owned entries are carried over VERBATIM — their hashes are the upstream's word, pinned by
 *   `governance:update`, never re-pinned locally (that is what makes an in-place edit detectable).
 * - Own-layer entries are re-hashed from disk. This is the one thing `governance:sync` does.
 *
 * `upstream` (a fetched upstream manifest) is passed by `applyUpstream`; without it the current
 * manifest's upstream entries are reused, which is the `--sync` case.
 */
export function writeManifest(root, { upstream = null } = {}) {
  const config = readConfig(root);
  const prev = readManifest(root);
  const excluded = new Set(readOptOut(root).paths);
  const upstreamSlug = config.upstream ?? prev?.upstream ?? null;

  const inherited = upstream
    ? (upstream.files ?? []).map((f) => ({ ...f, layer: f.layer ?? "core" }))
    : upstreamEntries(prev, config.layer);

  const inheritedPaths = new Set(inherited.map((f) => f.path));
  const own = config.layer
    ? computeFiles(root, config)
        .filter((f) => !inheritedPaths.has(f.path))
        .map((f) => ({ ...f, layer: config.layer }))
    : [];

  const files = [...inherited, ...own]
    .filter((f) => !excluded.has(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  // An opted-out path leaves the pin — but not the record. Without this, nothing downstream can tell
  // whether the path was opted out of an UPSTREAM layer (legitimate, ADR-CORE-032) or quietly dropped from
  // the layer this repo publishes, which would silently stop shipping a file to every consumer.
  const optedOut = [...inherited, ...own]
    .filter((f) => excluded.has(f.path))
    .map((f) => ({ path: f.path, layer: f.layer }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const manifest = {
    generated: true,
    // A repo that owns a layer versions it with its own SemVer (ADR-CORE-024). A leaf owns none, so the
    // number it carries is the governance it received — never its own app version, which would make
    // `governanceVersion` mean two different things depending on who you ask.
    governanceVersion: config.layer
      ? pkgVersion(root)
      : (upstream?.governanceVersion ?? prev?.governanceVersion ?? null),
    upstream: upstreamSlug,
    layers: buildLayers({ root, config, prev, upstream, upstreamSlug }),
    optedOut,
    count: files.length,
    files,
  };

  const abs = path.join(root, MANIFEST_REL);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/**
 * The drift-gate. Recomputes the hashes and reports every problem found; pure — no output, no exit.
 *
 * - A file owned by an UPSTREAM layer must not be edited or deleted here. Diverge via an overlay, by
 *   upstreaming the change, or with an explicit opt-out (ADR-CORE-032).
 * - A file in this repo's OWN layer must be pinned and current — a stale or missing pin means the repo
 *   is about to publish a manifest that does not describe what it ships.
 */
export function checkCore(root) {
  const manifest = readManifest(root);
  const config = readConfig(root);

  if (!manifest) {
    return {
      ok: false,
      layer: config.layer,
      upstream: config.upstream,
      isRoot: !config.upstream,
      publishes: Boolean(config.layer),
      optOut: [],
      pinnedCount: 0,
      problems: [`${MANIFEST_REL} missing — run \`npm run governance:sync\`.`],
    };
  }

  const problems = [...config.errors];
  const { paths: optOut, errors } = readOptOut(root);
  problems.push(...errors);

  const ownLayer = config.layer;
  const governed = new Set(governedPaths(root, config));
  const inherited = new Map(upstreamEntries(manifest, ownLayer).map((f) => [f.path, f]));
  const optedRecord = new Map((manifest.optedOut ?? []).map((o) => [o.path, o.layer]));

  // --- opt-out validity -------------------------------------------------------------------------
  for (const p of optOut) {
    if (!optedRecord.has(p) && !inherited.has(p) && !governed.has(p)) {
      problems.push(`${OPT_OUT_REL}: not a governed path: ${p}`);
      continue;
    }
    // Known, but not inherited from an upstream ⇒ it is a file this repo itself publishes.
    const layer = optedRecord.get(p) ?? inherited.get(p)?.layer ?? ownLayer;
    if (ownLayer && layer === ownLayer) {
      problems.push(
        `${OPT_OUT_REL}: ${p} is in this repo's own layer '${ownLayer}' — you already own it. ` +
          `An opt-out only takes an UPSTREAM-owned path out of the pin; using it here would silently ` +
          `stop publishing the file to every consumer.`,
      );
    }
  }
  if (!config.upstream && optOut.length) {
    problems.push(
      `${OPT_OUT_REL} is for consumers only — this repo has no upstream and owns everything it ships.`,
    );
  }

  // --- line endings: LF, on every platform, enforced -------------------------------------------------
  //
  // `.gitattributes` declares `* text=auto eol=lf`, so a fresh checkout gives LF even on Windows. But a
  // declaration only governs what GIT writes. Any tool that writes a file afterwards can undo it — a
  // Python script's `write_text`, an editor, a generator — and git then normalises it back on commit
  // without a word. The working tree drifts to CRLF while the repository holds LF, and two things break
  // that nobody can see locally:
  //
  //   • the governance HASHES document content, so the same file hashes differently on a CRLF working
  //     tree than on a Linux CI runner — `check:all` green on the maintainer's machine, red in CI, for
  //     every push, and no local run can ever reproduce it (this happened);
  //   • a `.husky` hook with CRLF simply does not run under bash.
  //
  // So LF is not a preference to declare; it is an invariant to enforce, on the files the governance
  // actually owns.
  const crlf = [];
  const optedOutPaths = new Set(optOut);
  for (const entry of manifest.files ?? []) {
    if (optedOutPaths.has(entry.path)) continue;
    const abs = path.join(root, entry.path);
    if (!fs.existsSync(abs)) continue;
    if (fs.readFileSync(abs, "utf8").includes("\r\n")) crlf.push(entry.path);
  }
  if (crlf.length) {
    problems.push(
      `${crlf.length} governed file(s) have CRLF line endings — the governance hashes content (so CI ` +
        `and your machine would disagree) and a shell hook does not run with CRLF. LF is required on ` +
        `every platform (.gitattributes: \`* text=auto eol=lf\`).\n` +
        crlf.map((p) => `      - ${p}`).join("\n") +
        `\n    Fix: \`git add --renormalize . && git checkout-index -f -a\` (or convert them in your ` +
        `editor). A tool that wrote them — a script, a generator — is the usual cause.`,
    );
  }

  // --- shadowing (ADR-CORE-032) ----------------------------------------------------------------------
  for (const { core: coreFile, shadows, overlay } of SHADOWING_CONFIG) {
    if (excludedOrMissing(root, coreFile, optOut)) continue;
    for (const name of shadows) {
      if (!fs.existsSync(path.join(root, name))) continue;
      problems.push(
        `${name} shadows the pinned ${coreFile} — the tool would load it instead of the governed config. ` +
          `Move your settings to ${overlay} (merged on top of it) and delete ${name}.`,
      );
    }
  }

  // --- the pin ----------------------------------------------------------------------------------
  const excluded = new Set(optOut);
  const pinned = (manifest.files ?? []).filter((f) => !excluded.has(f.path));
  const layerSource = new Map((manifest.layers ?? []).map((l) => [l.id, l.source]));

  // Hash the union of what this repo GOVERNS and what the manifest PINS — not just the former. A
  // consumer does not declare the memory/config files an upstream layer owns (`owns.*` is per layer),
  // so scanning only its own governed set would report every one of them as missing.
  const current = new Map();
  for (const p of new Set([...governed, ...pinned.map((f) => f.path)])) {
    const abs = path.join(root, p);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) current.set(p, hashFile(root, p));
  }

  for (const entry of pinned) {
    const layer = entry.layer ?? "core";
    const mine = layer === ownLayer;
    const cur = current.get(entry.path);

    if (cur === undefined) {
      problems.push(`missing ${mine ? "own" : "upstream"} file (layer '${layer}'): ${entry.path}`);
      continue;
    }
    if (cur === entry.hash) continue;

    problems.push(
      mine
        ? `stale pin (layer '${layer}'): ${entry.path} — run \`npm run governance:sync\`.`
        : `drift: ${entry.path} is owned by layer '${layer}'` +
            `${layerSource.get(layer) ? ` (from ${layerSource.get(layer)})` : ""} and must not be edited here.`,
    );
  }

  // A repo that owns a layer must pin everything in it, or it publishes a manifest that lies about what
  // it ships. A leaf consumer owns no layer, so an unpinned governed file is simply project-owned.
  if (ownLayer) {
    const pinnedPaths = new Set(pinned.map((f) => f.path));
    for (const p of governed) {
      if (current.has(p) && !pinnedPaths.has(p) && !excluded.has(p)) {
        problems.push(
          `unpinned file (layer '${ownLayer}'): ${p} — run \`npm run governance:sync\` to pin it.`,
        );
      }
    }
  }

  return {
    ok: problems.length === 0,
    layer: ownLayer,
    upstream: config.upstream,
    isRoot: !config.upstream,
    publishes: Boolean(ownLayer),
    optOut,
    pinnedCount: pinned.length,
    problems,
  };
}

/**
 * Paths this repo owns that the upstream has started shipping under the same name. Silently
 * overwriting them is data loss — the upstream would replace a file this repo authored, and the diff
 * would look like an ordinary update. Surfaced as a hard error instead: rename yours, or opt out.
 */
export function detectCollisions({ local, upstream, ownLayer }) {
  if (!ownLayer) return [];
  const mine = new Set(
    (local?.files ?? []).filter((f) => (f.layer ?? null) === ownLayer).map((f) => f.path),
  );
  return (upstream?.files ?? []).map((f) => f.path).filter((p) => mine.has(p));
}

/**
 * Copy the upstream files into `root`, skipping opted-out paths. `filter` narrows the set — the CLI
 * uses it to refresh `scripts/` **before** anything else and then re-execute, because a consumer runs
 * its own (old) copy of this logic while fetching the new one; without that self-update, a fix to the
 * update logic would only take effect on the *next* update. Returns `{ changed, skipped }`.
 */
export function copyCore({ root, srcDir, upstream, optOut = [], filter = () => true }) {
  const excluded = new Set(optOut);
  const changed = [];
  const skipped = [];

  for (const { path: rel } of upstream.files ?? []) {
    if (!filter(rel)) continue;
    if (excluded.has(rel)) {
      skipped.push(rel);
      continue;
    }
    const src = path.join(srcDir, rel);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(root, rel);
    const next = fs.readFileSync(src);
    const prev = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
    if (!prev || !prev.equals(next)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, next);
      changed.push(rel);
    }
  }

  return { changed, skipped };
}

/**
 * Apply the upstream's layers to this repo: overwrite every path the upstream owns, delete the ones it
 * dropped, and re-pin the manifest — except for opted-out paths, which are left exactly as this repo
 * has them (not overwritten, not deleted, not pinned).
 *
 * This repo's OWN layer is never touched. That is not a nicety: the deletion pass below removes locally
 * pinned files that the upstream no longer ships, and every file of the own layer is, by definition,
 * absent from the upstream manifest. Filtering the pass to upstream-owned entries is the only thing
 * standing between an update and the deletion of this repo's entire app layer.
 *
 * Returns `{ changed, removed, skipped, released }` (all repo-relative paths).
 */
export function applyUpstream({ root, srcDir, upstream, local, optOut = [] }) {
  const config = readConfig(root);
  const ownLayer = config.layer;
  const excluded = new Set(optOut);
  const removed = [];
  const released = [];

  const { changed, skipped } = copyCore({ root, srcDir, upstream, optOut });

  // Upstream files *deleted* upstream are deleted here too — they are upstream-owned, and a rule dropped
  // there must not linger here. The deletion is visible in `git diff` for review.
  //
  // Leaving the manifest is NOT the same as being deleted: a path can be reclassified to the project
  // layer (ADR-CORE-032 did this to tsconfig/vite/.prettierignore) — the upstream still ships it, it is simply
  // no longer pinned. Such a path is *released*: its file stays exactly as this repo has it, edits and
  // all. Deleting it here would silently destroy a project's own config.
  const upstreamPaths = new Set((upstream.files ?? []).map((f) => f.path));
  for (const { path: rel } of upstreamEntries(local, ownLayer)) {
    if (upstreamPaths.has(rel) || excluded.has(rel)) continue;
    if (fs.existsSync(path.join(srcDir, rel))) {
      released.push(rel);
      continue;
    }
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      fs.rmSync(abs);
      removed.push(rel);
    }
  }

  writeManifest(root, { upstream });

  return { changed, removed, skipped, released };
}
