# 101 — The library half of ADR-APP-026 is now gated: write `ui-boundary.json`

Audience: the agent working in a project built on `saga-rust-template` (e.g. `ivaldi`).
Layer: **app**. Follows briefing [100](100-ui-defaults-not-libraries.md), which corrected the *rule*;
this one gives it **teeth**.

## What changed

Briefing 100 stated the rule properly: a **view** composes nothing but HUD primitives — a component
imported straight out of a library is exactly as wrong as a native `<button>`. But only the *native* half
was ever enforced. `import { Button } from "some-kit"` in the middle of a view passed `check:all` green.

That is the failure rule:knowledge-handover §1 names: a rule the gate does not refuse is a comment. So
the gate now covers both halves.

## What you must do — this WILL fail your lint run until you do it

Create **`ui-boundary.json`** in the repo root and classify **every** runtime dependency
(`package.json` → `dependencies`) into exactly one list:

```jsonc
{
  "viewSafe": ["react", "react-dom", "zustand", "@tanstack/react-query", "@tauri-apps/api", "lucide-react"],
  "primitiveOnly": [],
  "notes": { "lucide-react": "icon glyphs — SVG paths, no chrome, no behaviour" }
}
```

- **`viewSafe`** — puts nothing on screen that the user touches: data, IPC, state, icons, fonts,
  utilities. Importable anywhere.
- **`primitiveOnly`** — renders UI. It may only be imported inside **`src/components/ui/**`**, where it
  sits *under* a primitive; none of its own look may escape that layer. ESLint rejects it anywhere else.
- **`notes`** — free-form, for the judgement calls. Write down *why*, for the next person.

`npm run lint` fails, with the list of offenders, until every dependency is classified. That is the whole
point: adding a UI kit now stops the build until someone decides what it is.

`ui-boundary.json` is **project-owned** — your dependencies are not the template's, so it is never
pinned and `governance:update` will never deliver or overwrite it.

## The judgement calls (nobody can automate these)

- **Icons** (`lucide-react`) → `viewSafe`. An icon is a glyph, not a control; the control around it is a
  HUD primitive, and the glyph inherits the HUD's colour.
- **A 3D / canvas renderer** (`three`, `@react-three/fiber`, `@react-three/drei`) → `viewSafe`. It draws
  a scene the app authors; it ships no stock DOM chrome. (`drei`'s `<Html>` overlay is the one place to
  be careful — what you render *into* it is DOM, and the HUD rules apply there in full.)
- **A native-dialog plugin** (`@tauri-apps/plugin-dialog`) → `viewSafe` as a dependency, but remember it
  opens **OS chrome**. That is only permitted as an explicit exception recorded in the owning feature's
  ADR (ADR-APP-026 §3) — never the silent easy path.
- **A styled component kit** (MUI, shadcn, a prebuilt suite) → `primitiveOnly`, and reconsider: you will
  spend more effort fighting its skin and its reset than drawing the chamfered neon HUD yourself.
- **A headless library** (Radix primitives, Floating UI) → `primitiveOnly`. This is the good case: it
  buys keyboard handling, focus traps and positioning, and it renders no appearance of its own. Use it
  *inside* `src/components/ui/`.

## What is now forbidden

- **Importing a `primitiveOnly` package outside `src/components/ui/**`.** ESLint rejects it and names the
  fix.
- **Leaving a dependency unclassified.** The lint run fails; there is no "later".
- **Classifying a UI kit as `viewSafe` to get past the gate.** It is not a loophole — it is a false
  statement in a tracked file the maintainer reviews, the same category as weakening a gate you do not
  own (rule:code-quality).
- **Installing a UI library as a `devDependency`** to dodge the classification. Circumvention, not a
  workaround.

## Why

The rule was always "an app built on saga uses no standard UI elements and brings every element into
line with the saga HUD itself". Half of that was machine-checked and half was a sentence in a document.
The half that was only a sentence is the half that would have quietly rotted.
