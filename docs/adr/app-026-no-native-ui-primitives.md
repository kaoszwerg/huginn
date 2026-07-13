---
id: ADR-APP-026
title: No native UI defaults — every control is a reusable HUD primitive
status: accepted
tldr: "No stock controls: every control the user touches is a HUD primitive, whatever it is built on; native chrome suppressed or replaced; lint gate enforces it."
scope: frontend
load: conditional
triggers:
  [
    button,
    dropdown,
    menu,
    context-menu,
    right-click,
    tooltip,
    select,
    dialog,
    native,
    primitive,
    control,
    form,
    library,
    import,
    ui-boundary,
  ]
applies-to:
  [
    "src/components/ui/**",
    "eslint.config.mjs",
    "ui-boundary.json",
    "scripts/lib/ui-boundary.mjs",
    "src/hooks/useNativeContextMenuGuard.ts",
  ]
supersedes: []
superseded-by: null
---

## Context

The HUD design system (ADR-APP-020) makes the look coherent, but coherence breaks the moment a control
falls back to a browser/OS default: a native `<button>`, a `<select>` dropdown, the right-click
context menu, a `title` tooltip bubble, an `alert()` dialog. Each of those renders in the platform's
own chrome — different on Windows WebView2, macOS WebKit and Linux WebKitGTK — and reads as a seam in
an otherwise custom interface. The maintainer's rule is explicit: **UI/UX breaks are not negotiable.**
Every interactive surface is ours to draw, and it must be built once and reused, not restyled per site.

## Decision

**No control the user touches may look or behave like a stock element.** Buttons, icon buttons, toggles,
menus, context/right-click menus, dropdowns/selects, tooltips, inputs and dialogs are **components of the
HUD design system**, living in `src/components/ui/` and composed everywhere else. A raw, unstyled element
is never dressed up ad hoc in a view.

The rule is about **defaults, not dependencies.** What a primitive is *built on* is an implementation
detail; what it *presents* is not:

- **A view may only ever compose a HUD primitive.** Never a native element, never a component imported
  straight from a library — those are the same defect wearing different clothes: a surface the user meets
  that nobody brought into line with the HUD.
- **A primitive in `src/components/ui/` may be built on anything** — a native element, or a third-party
  library used as an unstyled/headless mechanism (behaviour, a11y wiring, focus management, positioning).
  What may **never** leak out of it is the thing's own appearance or chrome: its stylesheet, its theme,
  its animations, its default markup. If it still reads as itself in a screenshot, it is not done.
- A library is therefore judged like any other dependency (rule:dependencies — justify it, check the
  licence, prefer the smaller one), **not** banned on sight. What is banned, always, is shipping its
  look.

1. **One primitive layer, reused.** `src/components/ui/` is the single home for interactive primitives
   (`Button`, `IconButton`, `Tooltip`, `TextField`, `HudPanel`, and further ones as features need
   them — `Select`, `Menu`/`ContextMenu`, `Checkbox`, `Switch`, `Dialog`). A view composes them; it
   does not hand-roll a second button. Shared surface logic (accent + chamfer classes) has one source
   (`hudButton.ts`), per ADR-CORE-005. New primitives are added **when a feature first needs them** (not
   speculatively — `knip` and ADR-CORE-002's "infra follows need" both apply), and each is built to the same
   standard: keyboard-operable, `aria`-labelled, empty/disabled states handled.

2. **Native webview chrome is suppressed or replaced.**
   - The **native right-click context menu** (Reload / Inspect / Copy image / Back …) is suppressed in
     **every** build (`useNativeContextMenuGuard`). It is a UI break in dev as much as in release, so it
     is not left on there. DevTools/Inspect are not lost in development: WebView2 (Windows) and
     WebKitGTK (Linux) expose DevTools through their own built-in shortcuts (F12 / Ctrl+Shift+I), which
     are independent of the page context menu. Any context menu the app needs is built as a HUD
     component.
   - The **native `title` tooltip** is banned; hover/focus hints use the `Tooltip` primitive.
   - **Native dialogs** (`alert`/`confirm`/`prompt`) are banned; prompts are HUD dialogs.
   - Native **form controls** (`<select>`, `<input>`, `<textarea>`, checkbox/radio) are replaced by HUD
     primitives; the range slider is already re-skinned in `globals.css` and is the pattern to follow.

3. **OS-drawn surfaces are replaced where the platform allows, and are a recorded exception where it
   does not.** The default is to bring a surface in-webview under HUD control (e.g. an in-app file
   browser or a HUD toast in preference to a native dialog/notification). A surface that is
   *irreducibly* OS-rendered — the **system tray menu** (ADR-APP-021), the native OS file dialog when no
   in-app equivalent is viable, OS notifications — may stay native, but only as an **explicit exception
   recorded in the owning feature's ADR** with its rationale; it is never the silent easy path
   (ADR-CORE-002). When an in-app replacement is hard, surface it and decide with the maintainer — do not
   quietly ship the native default.

4. **A lint gate makes it non-negotiable, not a review habit — for BOTH halves.** `eslint.config.mjs`
   runs in `check:all` (ADR-CORE-008), so a UI break fails the build. **`src/components/ui/**` is the one
   exemption** — it is where primitives are legitimately built on native elements or a headless
   library — as are test files (native elements as fixtures).

   - **The native half:** raw `<button>/<input>/<select>/<textarea>`, the native `title` attribute and
     `alert/confirm/prompt` are banned outside the primitive layer (`no-restricted-syntax` + `no-alert`).
   - **The library half** (`ui-boundary.json` + `scripts/lib/ui-boundary.mjs`): every **runtime
     dependency is classified** — `viewSafe` (renders nothing the user touches: data, IPC, state, icons,
     fonts) or `primitiveOnly` (renders UI). A `primitiveOnly` package is banned outside
     `src/components/ui/**` (`no-restricted-imports`), and **an unclassified dependency fails the lint
     run outright**.
   - **The half that makes the classification impossible to dodge**
     (`import-x/no-extraneous-dependencies`, `devDependencies: false` on `src/**`): production code may
     import **only declared runtime dependencies**. Classifying `dependencies` alone left a door open, and
     for one commit it stood open: a UI kit installed as a **devDependency** never appears in
     `dependencies`, so it was invisible to the completeness check, never landed in `primitiveOnly`, got
     no import pattern — and a view imported it with the gate green. The manifest section a package sits
     in changes nothing about what the bundler will resolve out of `node_modules`. Now a devDependency and
     an undeclared, transitively-present package are both rejected in `src/**`, so **every package a view
     can reach is a `dependencies` entry, and every `dependencies` entry must be classified.** Neither
     half suffices alone; together they leave no door. (Tests may import the test runner — a test is not
     shipped UI.)

   That completeness check is the whole design. A denylist of "the UI libraries we install" would not be
   a gate at all: it fires only if whoever added the library also remembered to list it — the same
   person, in the same commit, who was about to do the wrong thing. Forcing the *classification* means
   `npm install`-ing a kit stops the build until someone decides what it is, and the decision is then
   enforced. `ui-boundary.json` is **project-owned** (every project has different dependencies), so it
   is never pinned and never delivered by an update — the gate is what makes a project write it.

   **What the gate cannot do, stated plainly:** it cannot decide *for* you whether a package renders UI.
   A charting library draws its own; a date library draws nothing. It forces the question to be asked and
   the answer to be written down in a file the maintainer reviews. Classifying a UI kit as `viewSafe` to
   get past it is not a loophole — it is a visible false statement in a tracked file, the same category
   as weakening a gate you do not own (rule:code-quality).

   One residual, and it is not a hole in practice: `import-x` must **resolve** an import to judge it, so a
   package that is declared but not installed produces no lint error — and no build either, because
   nothing can resolve it. After any `npm ci` the rule sees it. The class of package a view can actually
   import is exactly the class the gate checks.

## Alternatives

- **Banning component libraries outright** — rejected, and this ADR previously got it wrong. The
  objection was never to the dependency; it was to the *look*. A **styled** library (MUI, shadcn, a
  prebuilt kit) is indeed a bad fit — you would spend more effort fighting its skin and its reset than
  drawing the chamfered neon HUD yourself, and its defaults leak at the edges. But a **headless** one
  (Radix primitives, Floating UI, …) ships behaviour, not appearance: used *inside* `src/components/ui/`
  it is no different from building on a native `<button>`, and it buys keyboard handling, focus traps and
  positioning that are easy to get subtly wrong. Judge it as a dependency (rule:dependencies), and hold
  the line where it actually matters — nothing reaches a view that has not been brought fully into line
  with the HUD.
- **Policy by review only, no gate** — rejected: "indiscutable" means a machine check, not a habit a
  tired reviewer can miss. The gate is cheap and catches the first native `<button>` that creeps in.
- **A denylist of the UI libraries the project happens to install** — rejected as insufficient (and it
  was the first shape this ADR's library half was proposed in). It only fires if whoever added the
  library also remembered to add it to the list; the failure mode it must prevent and the maintenance it
  demands land on the same person in the same commit. Classifying **every** runtime dependency, and
  failing on an unclassified one, is what turns it from a checklist into a gate.
- **Enforcing it as a new `check:all` step instead of inside the lint config** — rejected: `package.json`
  is project-owned (ADR-CORE-032), so a consumer can simply not add the step, and nothing would say so.
  `eslint.config.mjs` is pinned app-layer config and `npm run lint` runs in every project's gate.
- **Keep native controls where "good enough"** — rejected: the whole point is zero seams; "good
  enough native" is exactly the break this ADR forbids.

## Consequences

- Every interactive control is HUD-styled and reused; a new view inherits the primitives for free and
  cannot accidentally ship an unstyled control (the gate stops it).
- The primitive catalogue grows feature-by-feature; the first feature to need a `Select`/`Menu` builds
  it in `src/components/ui/` (with tests) rather than reaching for a native element.
- The shell itself was brought into compliance in the same change: all existing raw buttons/inputs and
  `title` tooltips were migrated to the primitives, and the context-menu guard was wired in.

## References

- ADR-APP-020 (HUD design system), ADR-APP-021 (window chrome / tray menu exception), ADR-CORE-005 (reusability,
  one source for shared UI), ADR-CORE-008 (the gate in `check:all`), ADR-CORE-002 (best solution, fix don't
  drop). Rules: `.claude/rules/ui-design.md`, `.claude/rules/reusability.md`, `.claude/rules/theming.md`.
- Code: `src/components/ui/` (primitives), `src/hooks/useNativeContextMenuGuard.ts`, `eslint.config.mjs`.
