// The UI boundary (ADR-APP-026) — app layer.
//
// ADR-APP-026 says: nothing the user touches may look or behave like a stock element. A **view** composes
// only HUD primitives; a **primitive** (`src/components/ui/**`) may be built on anything, as long as
// nothing of that thing's own appearance escapes it.
//
// The native half of that rule has always been gated (ESLint bans raw <button>/<input>/… outside the
// primitive layer). The *library* half was, until this module existed, prose only: an
// `import { Button } from "some-kit"` in the middle of a view passed the gate green. That is precisely
// the state rule:knowledge-handover §1 calls out — a rule nobody can get wrong is a gate; a rule you
// have to remember is a comment.
//
// So every runtime dependency is CLASSIFIED, in a project-owned `ui-boundary.json`:
//
//   { "viewSafe":      ["react", "zustand", "lucide-react", …],   // importable anywhere
//     "primitiveOnly": ["@radix-ui/react-select", …],             // only under src/components/ui/**
//     "notes":         { "<pkg>": "why it is classified that way" } }
//
// A denylist alone would not be a gate: it only fires if whoever added the library also remembered to
// add it to the list — the same person, in the same commit, who was about to do the wrong thing. The
// completeness check below is what closes that: an **unclassified dependency fails the lint run**, so
// `npm install`-ing a UI kit forces the decision, and the decision is then enforced by ESLint.
//
// What this cannot do — stated plainly, because pretending otherwise would be the same defect one level
// up: it cannot decide *for* you whether a package renders UI. A charting library draws its own; a date
// library draws nothing. The gate forces the question to be asked and the answer to be written down in a
// file the maintainer reviews. Classifying a UI kit as `viewSafe` to get past it is not a loophole, it is
// a visible lie in a tracked file — the same category as weakening a gate you do not own
// (rule:code-quality).
import fs from "node:fs";
import path from "node:path";

export const BOUNDARY_REL = "ui-boundary.json";

/**
 * The project's declared **runtime** dependencies — the set this file classifies.
 *
 * It reads `dependencies` only, and that is **not** because a view cannot reach anything else. It can:
 * the bundler resolves out of `node_modules`, and the manifest section a package happens to sit in
 * changes nothing about that. This comment used to claim the opposite ("the only ones a view could
 * import at all"), and that false claim was the whole reason the gate had a hole — a UI kit installed as
 * a `devDependency` was invisible here, never landed in `primitiveOnly`, and a view imported it while
 * `check:all` stayed green. A wrong comment is worse than none, because it is believed
 * (rule:documentation).
 *
 * What actually closes the loop is a second, independent rule in `eslint.config.mjs`:
 * `import-x/no-extraneous-dependencies` with `devDependencies: false` forbids production code under
 * `src/**` from importing anything that is not a declared runtime dependency — a devDependency and an
 * undeclared, transitively-present package alike. So every package a view can reach **is** a
 * `dependencies` entry, and every `dependencies` entry must be classified here. Neither half is
 * sufficient alone; together they leave no door.
 */
export function dependenciesOf(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  return Object.keys(pkg.dependencies ?? {}).sort();
}

/**
 * Read `ui-boundary.json`. Project-owned (every project has different dependencies), so it is never
 * pinned and never delivered by `governance:update` — the gate below is what makes a project write it.
 */
export function readBoundary(root) {
  const abs = path.join(root, BOUNDARY_REL);
  const empty = { viewSafe: [], primitiveOnly: [], notes: {} };

  if (!fs.existsSync(abs)) {
    return { ...empty, errors: [`${BOUNDARY_REL} is missing.`] };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    return { ...empty, errors: [`${BOUNDARY_REL} is not valid JSON: ${err.message}`] };
  }

  const list = (v, name) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((s) => typeof s !== "string")) {
      return null;
    }
    void name;
    return v.map((s) => s.trim()).filter(Boolean);
  };

  const viewSafe = list(parsed.viewSafe, "viewSafe");
  const primitiveOnly = list(parsed.primitiveOnly, "primitiveOnly");
  if (!viewSafe || !primitiveOnly) {
    return {
      ...empty,
      errors: [`${BOUNDARY_REL}: 'viewSafe' and 'primitiveOnly' must be arrays of package names.`],
    };
  }

  return { viewSafe, primitiveOnly, notes: parsed.notes ?? {}, errors: [] };
}

/**
 * Every runtime dependency must be classified exactly once. Returns human-readable errors that name the
 * exact next step — a gate that fires without saying what to do is a riddle, not a guard
 * (rule:knowledge-handover §1).
 */
export function validateBoundary({ deps, boundary }) {
  const errors = [];
  const viewSafe = new Set(boundary.viewSafe);
  const primitiveOnly = new Set(boundary.primitiveOnly);

  const unclassified = deps.filter((d) => !viewSafe.has(d) && !primitiveOnly.has(d));
  if (unclassified.length) {
    errors.push(
      `${unclassified.length} dependency/dependencies are not classified in ${BOUNDARY_REL}: ` +
        `${unclassified.join(", ")}.\n` +
        `    Does it put anything on screen that the user touches?\n` +
        `      no  → "viewSafe"      (data, IPC, state, icons, fonts, utilities — importable anywhere)\n` +
        `      yes → "primitiveOnly" (it may only sit UNDER a primitive in src/components/ui/**, and\n` +
        `                             none of its own look may escape that layer — ADR-APP-026)`,
    );
  }

  const both = [...viewSafe].filter((d) => primitiveOnly.has(d));
  if (both.length) {
    errors.push(`classified twice in ${BOUNDARY_REL}: ${both.join(", ")}. Pick one.`);
  }

  const known = new Set(deps);
  const stale = [...viewSafe, ...primitiveOnly].filter((d) => !known.has(d));
  if (stale.length) {
    errors.push(
      `${BOUNDARY_REL} classifies packages that are not runtime dependencies: ${stale.join(", ")}. ` +
        `Remove them, or add them to "dependencies".`,
    );
  }

  return errors;
}

/**
 * The ESLint `no-restricted-imports` patterns for the primitive-only packages. `pkg` and every subpath
 * (`pkg/foo`) are covered — a kit's entry point is rarely the only door in.
 */
export function restrictedPatterns(primitiveOnly) {
  return primitiveOnly.map((pkg) => ({
    group: [pkg, `${pkg}/*`],
    message:
      `${pkg} may only be imported inside src/components/ui/** (ADR-APP-026). A view composes HUD ` +
      `primitives — never a component straight out of a library, which is the same defect as a native ` +
      `<button>: a surface the user meets that nobody brought into line with the HUD. Wrap it in a ` +
      `primitive there, let none of its own styling escape, and compose that.`,
  }));
}

/** The whole check, as the lint config runs it. Returns the error list (empty = the boundary holds). */
export function checkBoundary(root) {
  const boundary = readBoundary(root);
  if (boundary.errors.length) return { boundary, errors: boundary.errors };
  return { boundary, errors: validateBoundary({ deps: dependenciesOf(root), boundary }) };
}
