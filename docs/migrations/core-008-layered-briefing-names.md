# core-008 — A migration briefing carries its layer in its filename (ADR-CORE-038)

Audience: the agent working in any repo that consumes this core — and especially in one that **publishes a
layer of its own** (a stack/app layer), because that repo has briefings to rename.
Layer: **core** (delivered by `governance:update`).

## What changed

Briefings were kept apart by number **ranges**, written in prose in `docs/migrations/README.md`: core
`001–099`, an app layer `100–199`, a project `200+`. Nothing enforced it, and the range is not what actually
protects you. The layer now lives **in the filename**:

```
docs/migrations/core-001-config-layering.md      core     (this repo)
docs/migrations/app-001-<slug>.md                app      (the layer you publish)
docs/migrations/proj-001-<slug>.md               project  (yours, never published)
```

The seven core briefings were renamed accordingly (`001-…` → `core-001-…`); numbers were kept 1:1, so every
old reference still decodes. `governance:update` has already applied that rename in your repo — the old
paths are gone, the new ones are there.

## What you must do

**1. If your repo publishes a layer, rename your own briefings.** Any briefing your layer owns must be
`<your-layer>-NNN-<slug>.md` — `app-100-foo.md` if you keep your numbers, `app-001-foo.md` if you renumber;
both are legal, the prefix is what matters. Numbering is per-layer now, so you are free of the old range
either way:

```bash
git mv docs/migrations/100-foo.md docs/migrations/app-100-foo.md
```

Then fix every link to it (your ADRs, your README, your CHANGELOG entries that are still unreleased).

**2. If you have project-only briefings, prefix them `proj-`.** Anything not pinned is the project layer.

**3. Run the gate.** It names every file that is still wrong and prints the corrected filename:

```bash
npm run governance:sync && npm run check:all
```

## What is now forbidden

- **A briefing named `NNN-<slug>.md`.** It claims no layer, and `governance:check` now rejects it — with
  the name you should have used. This is the shape that collides.
- **Reintroducing number ranges.** They were prose in a README, checked by nothing, and finite. Do not add
  a "core gets 001–099" convention back; the prefix replaced it, and per-layer numbering has no ceiling.
- **Picking "the next free number" from what you see in `docs/migrations/`.** That directory holds *every*
  layer's briefings, not just yours. Number within **your** prefix, and ignore the rest.

## Why

A briefing has no front-matter and no id, so the **filename is its identifier** — and it is the one thing
two layers can collide on. The old range was supposed to prevent that, but it never could:

- **No gate looked at the directory.** The rule existed only in a README that no agent is required to read
  and `context-for.mjs` never hands out.
- **The collision needs nowhere near 100 briefings.** An agent in the app layer opens `docs/migrations/`,
  sees it end at `007-…` (the core's briefings are pinned right there in its repo), and takes `008-…` as the
  next free number. It has never heard of the range. The next core change ships `008-…` too — same path.
- **It fails where it hurts most.** The collision is not caught in the repo that made it. It surfaces in
  *yours*, in `detectCollisions`, which **aborts `governance:update` entirely** — you can pull nothing until
  someone renames a file that is already published.

This is the argument ADR-CORE-034 made for ADR ids, applied to the one artefact class that was left behind.
A number cannot contradict reality, so no gate can catch it lying. A prefix is a claim about which layer
owns the file — and a claim can be checked against the manifest, which is exactly what the gate now does.
