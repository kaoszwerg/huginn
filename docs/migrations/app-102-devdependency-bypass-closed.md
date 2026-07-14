# 102 — The devDependency bypass in the UI boundary is closed (ADR-APP-026)

Audience: the agent working in a project built on `saga-rust-template` (e.g. `ivaldi`).
Layer: **app**. Closes the hole that briefing [101](101-ui-boundary-gate.md) left open.

## What was wrong

Briefing 101 made every **runtime dependency** classifiable in `ui-boundary.json` and had the lint run
fail on an unclassified one. It missed a door, and the door was exactly the kind the gate exists to shut:

```
npm i -D some-ui-kit
// src/views/Foo.tsx
import { Button } from "some-ui-kit";
→ npm run check:all  … GREEN
```

`ui-boundary.json` classifies `dependencies`. A package installed as a **devDependency** never appears
there, so the completeness check could not see it, it never landed in `primitiveOnly`, and
`no-restricted-imports` got no pattern for it. The bundler does not care which manifest section a package
sits in — it resolves out of `node_modules` either way — so the view imported it and the whole gate stayed
green.

Briefing 101 *forbade* this ("installing a UI library as a devDependency to dodge the classification is
circumvention"). But it forbade it **in prose**, and prose is the half that rots
(rule:knowledge-handover §1).

## What is now enforced

`eslint.config.mjs` (pinned, app layer) adds **`import-x/no-extraneous-dependencies`** with
`devDependencies: false` for `src/**`:

- **A devDependency imported from production code → error.**
  `'vitest' should be listed in the project's dependencies, not devDependencies`
- **A package declared nowhere at all → error** (a transitive one is still sitting in `node_modules`).
  `'acorn' should be listed in the project's dependencies. Run 'npm i acorn' to add it`
- **Tests are exempt** (`devDependencies: true`): a test legitimately imports the test runner and the
  testing library, and a test is not shipped UI.

Together with 101 the loop closes by construction: **every package a view can reach is a `dependencies`
entry, and every `dependencies` entry must be classified in `ui-boundary.json`.** Neither half is
sufficient alone.

## What you must do

**Only if your `src/**` imports something that is not a runtime dependency** — then your next
`npm run lint` goes red, and it is right to. For each package the error names:

1. **Is it needed at runtime?** Move it from `devDependencies` to `dependencies`
   (`npm i <pkg>` / edit `package.json`), then **classify it in `ui-boundary.json`** — `viewSafe` if it
   renders nothing the user touches, `primitiveOnly` if it renders UI (then it may only be imported from
   `src/components/ui/**`).
2. **Is it only build/test tooling that leaked into `src/`?** Then the import is the bug. Move the code,
   or move the import into a test file.
3. **Is it a transitive package you were relying on implicitly?** Declare it. Relying on someone else's
   dependency tree is how a build breaks on a patch release.

Nothing else changes. If your production code only imports declared runtime dependencies — which is the
normal case — you will not notice this briefing at all.

## What is now forbidden

- **Importing a devDependency from `src/**`.** Rejected by the lint run, with the fix in the message.
- **Importing an undeclared package from `src/**`.** Same.
- **Installing a UI library as a `devDependency` to keep it out of `ui-boundary.json`.** It was already
  forbidden; now it is impossible.

## Why

The commit that introduced the boundary was written to end the state where half a rule is machine-checked
and half is a sentence. It then shipped with exactly that flaw one level down. The comment on
`dependenciesOf()` even asserted the false premise out loud — *"the only ones a view could import at
all"* — which is how the hole survived review: a wrong document is worse than none, because it is believed
(rule:documentation).
