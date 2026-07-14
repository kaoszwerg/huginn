# app-105 — this layer's briefings are now `app-NNN-…` (ADR-CORE-038)

Audience: the agent working in a project **forked from this Tauri shell**.
Layer: **app** (delivered by `governance:update`).

## What changed

The core moved the layer into the briefing **filename** (ADR-CORE-038, `core-008-layered-briefing-names.md`):
a briefing has no front-matter and no id, so its name *is* its identifier — and the name was the one thing
two layers could collide on. Number ranges (core `001–099`, app `100–199`) were prose in a README that no
gate ever read.

This layer followed. The five briefings it publishes were renamed, **numbers kept 1:1**:

```
100-ui-defaults-not-libraries.md      →  app-100-ui-defaults-not-libraries.md
101-ui-boundary-gate.md               →  app-101-ui-boundary-gate.md
102-devdependency-bypass-closed.md    →  app-102-devdependency-bypass-closed.md
103-no-push-ci.md                     →  app-103-no-push-ci.md
104-crash-handling-mechanism.md       →  app-104-crash-handling-mechanism.md
```

`governance:update` has already applied that rename in your repo: the old paths are gone, the new ones are
there. Every old reference still decodes — `104` is still `104`.

## What you must do

**1. Fix your links.** Anything of yours that pointed at the old paths is now a dead link: your ADRs, your
`README`, and any **unreleased** `CHANGELOG` entry. `governance:check` reports them by name.

```bash
grep -rn "migrations/[0-9]" --include="*.md" .    # anything this finds is stale
```

**2. Prefix your own briefings `proj-`.** If your project ships briefings of its own, they belong to the
project layer: `proj-001-<slug>.md`. They are never pinned and never published.

**3. Number within your own prefix — never off the directory listing.** `docs/migrations/` holds *every*
layer's briefings. Seeing `core-008-…` there does not make `009` yours, and it does not make `app-009` the
next one either. **This layer's next briefing is `app-106`.**

Then: `npm run governance:sync && npm run check:all`.

## What is now forbidden

- **A briefing named `NNN-<slug>.md`.** It claims no layer, and the gate rejects it — with the name you
  should have used.
- **Reintroducing number ranges.** The prefix replaced them; per-layer numbering has no ceiling, and a range
  written in prose was never checked by anything.
