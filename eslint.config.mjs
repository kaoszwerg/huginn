// Core ESLint configuration — template-owned and hash-pinned (ADR-CORE-030). It carries the governance
// gates (ADR-APP-026's ban on native UI defaults, secret detection, security rules), so a project must not
// edit it in place. Project-specific lint config goes into `eslint.config.project.mjs` (project-owned,
// never pinned, never overwritten by `governance:update`); it is appended AFTER the core below, so a
// fork adds its own ignores/rules/overrides without touching this file (ADR-CORE-032).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import security from "eslint-plugin-security";
import noSecrets from "eslint-plugin-no-secrets";
import importX from "eslint-plugin-import-x";
import { BOUNDARY_REL, checkBoundary, restrictedPatterns } from "./scripts/lib/ui-boundary.mjs";
import { BOUNDARIES_REL, checkCrashGate } from "./scripts/lib/crash-gate.mjs";

// The UI boundary (ADR-APP-026). Enforced HERE, and not as another `package.json` script, on purpose:
// `package.json` is project-owned, so a consumer could simply leave the step out of `check:all` — while
// this file is pinned app-layer config and `npm run lint` runs it in every project, always.
//
// Failing to declare the boundary fails the lint run. That is deliberate: the alternative is a rule that
// exists only in prose, which is the exact failure rule:knowledge-handover §1 names — and it was real
// here, for one commit: the prose already forbade importing a library component into a view while the
// gate happily let it through.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const { boundary, errors: boundaryErrors } = checkBoundary(ROOT);
if (boundaryErrors.length) {
  throw new Error(
    [
      "",
      `ADR-APP-026 — the UI boundary is not declared (${BOUNDARY_REL}):`,
      "",
      ...boundaryErrors.map((e) => `  - ${e}`),
      "",
      `  ${BOUNDARY_REL} is project-owned: every project has different dependencies, so it is never`,
      "  pinned and never delivered by an update. Classify every runtime dependency once:",
      "",
      `    { "viewSafe":      ["react", "zustand", "lucide-react"],`,
      `      "primitiveOnly": ["@radix-ui/react-select"],`,
      `      "notes":         { "three": "a WebGL scene the app authors — no stock DOM chrome" } }`,
      "",
      "  viewSafe      — puts nothing on screen the user touches (data, IPC, state, icons, fonts).",
      "  primitiveOnly — renders UI. It may only sit UNDER a primitive in src/components/ui/**, and",
      "                  none of its own look may escape that layer.",
      "",
    ].join("\n"),
  );
}
const primitiveOnlyImports = restrictedPatterns(boundary.primitiveOnly);

// The crash gate (ADR-CORE-037, ADR-APP-032). Same reasoning as the UI boundary above, and the same
// place: ADR-CORE-037 states outright that the core cannot check this — it does not know what an entry
// point is in this stack — and hands the obligation to gate it to the layer that does. This is that
// gate, and it runs on every `npm run lint`, in every project, always.
//
// It is not an ESLint rule because two of the three entry points it guards are RUST files, which ESLint
// never sees. Running at config-load time is what lets one check cover both runtimes of a Tauri app —
// and a crash gate that could only see half the app would be worse than none, because it would look
// like coverage.
const { errors: crashErrors } = checkCrashGate(ROOT);
if (crashErrors.length) {
  throw new Error(
    [
      "",
      "ADR-CORE-037 — an entry point can die silently:",
      "",
      ...crashErrors.map((e) => `  - ${e}`),
      "",
      "  A crash is permitted. A SILENT crash is not: every entry point logs, tells the user, leaves a",
      "  crash report on the device, and exits with a defined code (.claude/rules/crash-handling.md).",
      "",
      "    src-tauri/src/lib.rs   — crash::install_panic_hook() FIRST, then the builder; handle its Err.",
      "    src/main.tsx           — installGlobalCrashHandlers() + mount inside <CrashBoundary>.",
      `    ${BOUNDARIES_REL}   — one entry per background task, saying HOW THAT TASK DIES.`,
      "",
      "  The mechanism lives in src-tauri/src/crash.rs and src/lib/crash.ts — see ADR-APP-032.",
      "",
    ].join("\n"),
  );
}

const core = tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "src-tauri/target",
      "src-tauri/gen",
      "src/bindings",
      "node_modules",
      "**/*.bak-*",
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // React / browser source.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
      security,
      "no-secrets": noSecrets,
      "import-x": importX,
    },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...security.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-secrets/no-secrets": "error",
      "import-x/no-unresolved": "off",
      // No native UI defaults (ADR-APP-026): every interactive control is a reusable HUD primitive.
      // Native dialogs (alert/confirm/prompt) are OS chrome and a UI break — build a HUD dialog.
      "no-alert": "error",
      // Ban native form/interactive elements and the native `title` tooltip everywhere EXCEPT the
      // primitive layer (src/components/ui, exempted below), which is where they are legitimately
      // built upon. Keep these selectors in sync with the primitives the HUD offers.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            "Native <button> is banned outside src/components/ui — use <Button>/<IconButton> from src/components/ui (ADR-APP-026).",
        },
        {
          selector: "JSXOpeningElement[name.name='input']",
          message:
            "Native <input> is banned outside src/components/ui — use a HUD input primitive like <TextField> (ADR-APP-026).",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Native <select> is banned — build a HUD Select primitive in src/components/ui (ADR-APP-026).",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message:
            "Native <textarea> is banned outside src/components/ui — build a HUD primitive (ADR-APP-026).",
        },
        {
          selector: "JSXAttribute[name.name='title']",
          message:
            "The native `title` tooltip is OS chrome and a UI break — use the <Tooltip> HUD primitive (ADR-APP-026).",
        },
      ],
      // The other half of ADR-APP-026, and the one that used to be prose only: a component imported straight
      // out of a library into a view is the same defect as a native <button> — a surface the user meets
      // that nobody brought into line with the HUD. Which packages those are is declared in
      // `ui-boundary.json`, and the boundary check above makes sure NONE is left unclassified.
      ...(primitiveOnlyImports.length
        ? { "no-restricted-imports": ["error", { patterns: primitiveOnlyImports }] }
        : {}),
      // …and this is what makes that classification IMPOSSIBLE TO DODGE.
      //
      // `ui-boundary.json` classifies `dependencies`. A UI kit installed as a *devDependency* was
      // therefore invisible to the completeness check, never landed in `primitiveOnly`, and got no
      // no-restricted-imports pattern — so a view could import it and the whole gate stayed green. The
      // bypass was forbidden in a briefing, i.e. in prose, i.e. in the half that rots
      // (rule:knowledge-handover §1).
      //
      // Production code under src/** may now import ONLY declared runtime `dependencies`. A devDependency
      // (Vite bundles from node_modules either way — the manifest section it sits in changes nothing) and
      // an entirely undeclared, transitively-present package are both rejected here. Every package a view
      // can reach is therefore a `dependencies` entry, and every `dependencies` entry must be classified.
      // The loop is closed by construction, not by memory.
      "import-x/no-extraneous-dependencies": [
        "error",
        { devDependencies: false, optionalDependencies: false, peerDependencies: false },
      ],
    },
  },

  // The UI primitive layer (src/components/ui) is the ONE place allowed to build on native elements, or
  // on a headless library — it IS the reusable HUD implementation the bans above point every other file
  // to (ADR-APP-026). What must never escape it is the source's own appearance: its stylesheet, theme,
  // animations or default markup. That part is held by review, not lint — if the result still reads as
  // itself in a screenshot, it is not finished.
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": "off", "no-restricted-imports": "off" },
  },

  // Node tooling: governance scripts and config files (including a project's own overlay files).
  {
    files: [
      "scripts/**/*.mjs",
      "*.config.{ts,js,mjs}",
      "*.project.mjs",
      "commitlint.config.js",
      "knip.config.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    plugins: { security, "no-secrets": noSecrets },
    rules: {
      ...security.configs.recommended.rules,
      "no-secrets/no-secrets": "error",
      // Governance scripts build globs->regex and read repo files from trusted, in-repo input only.
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "off",
      "security/detect-unsafe-regex": "off",
    },
  },

  // Test files may use node globals and looser rules — including raw native elements as test
  // fixtures (e.g. a bare <button> to mount a hook or primitive against).
  {
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "no-restricted-syntax": "off",
      "no-restricted-imports": "off",
      // A test is not shipped UI: it legitimately imports the test runner and the testing library, which
      // are devDependencies. It still may not import a package that is declared nowhere at all.
      "import-x/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
);

// The project overlay, appended after the core so a project can add ignores, rules and overrides
// (ADR-CORE-032). ESLint imports this config dynamically, so a top-level await is legitimate here; no
// overlay file simply means the core stands alone. A project that relaxes a core rule here does so
// visibly, in a file it owns — the one thing ADR-CORE-030 forbids is a silent in-place edit of the core.
const OVERLAY = new URL("./eslint.config.project.mjs", import.meta.url);
const overlay = fs.existsSync(OVERLAY) ? (await import(OVERLAY.href)).default : [];

export default [...core, ...(Array.isArray(overlay) ? overlay : [overlay])];
