# 001 — Config layering, project overlays, explicit opt-out (ADR-CORE-032)

**Audience: the agent working in a project built on this template.** Read this before you touch any
tooling config or write a rule. Everything below is enforced by `npm run check:all` — ignoring it does
not get you a silent shortcut, it gets you a red gate.

## STOP — how to pull this in, in this order

`governance:update` runs **your project's own copy** of the update logic. A project created before this
change carries the *old* copy, which conflated "the template unpinned this file" with "the template
deleted it". Running it straight would delete your `tsconfig.json`, `tsconfig.node.json`,
`vite.config.ts` and `.prettierignore` from the working tree. The template now refreshes its scripts and
re-executes before doing anything else — but that fix cannot bootstrap itself into a project that does
not have it yet. **Verified against a real fork: running the update directly did exactly this.**

So pull the scripts by hand, once. This *is* the self-update, done manually:

```bash
git status                                                        # 1. must be clean
git remote add template https://github.com/<owner>/<template>.git # 2. once, if absent
git fetch template main
git checkout template/main -- scripts/                            # 3. the self-updating logic
npm run governance:update                                         # 4. now safe
npm run check:all
```

From the next update on, step 3 is automatic (the script does it itself) and `npm run governance:update`
alone is enough.

**Then check `git diff`:**

- `tsconfig*.json`, `vite.config.ts`, `.prettierignore` are **still there**, reported as *released* to
  the project layer — they belong to you now.
- `knip.json` is **gone on purpose** (replaced by the pinned `knip.config.js`). Had settings in it?
  `git show HEAD:knip.json`, then move them into `knip.project.json`.

**The update is not atomic.** It writes the core, then verifies. If the gate goes red afterwards, the
tree is half-updated and the script tells you both exits: finish it (fix what the gate reported — most
likely a pre-existing problem in your project layer, e.g. a `conditional` rule/ADR/memory with no
`triggers`, which is now rejected as unreachable), or roll back with `git checkout -- . && git clean -fd`.
That rollback is only safe because the tree was clean at the start — which is why the update now refuses
to run on a dirty tree.

## Why this exists

The drift-gate used to pin config that a project must own (`knip.json`, `tsconfig*.json`,
`vite.config.ts`, `.prettierignore`). The reliable trip-wire: your generated `src/bindings/**` has no
consumer yet, `knip` reports the files as unused, and the obvious fix — an `ignore` in `knip.json` —
drifted a template-owned file and turned `check:all` red. You could not configure your own quality
gate. Worse, the gate's error message offered an "opt-out" that did not exist.

## 1. Know which class of config you are touching

**Pinned core — never edit in place.** The drift-gate is fatal, and that is deliberate:

`CLAUDE.md`, `eslint.config.mjs`, `knip.config.js`, `.husky/*`, `commitlint.config.js`,
`.secretlintrc.json`, `.lintstagedrc.json`, `.prettierrc.json`, `.editorconfig`, `.gitattributes`,
`src-tauri/deny.toml`, `scripts/**`, `.claude/rules/*.md`, `docs/adr/NNN-*.md`, `docs/migrations/*.md`.

**Project-owned — yours, edit freely, never pinned:**

`tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `.prettierignore`,
`.claude/rules/project/*.md`, `docs/adr/project/NNN-*.md` (numbered from 100),
`.claude/memory/project-scope.md`, **`scripts/project/*`**.

Your own tooling script goes in **`scripts/project/`** — not directly in `scripts/`. The whole of
`scripts/` is template-owned; a script of yours sitting there survives an update only by luck, and the
day the template ships a script with the same name, yours is overwritten without a word.
`scripts/project/` is reserved: never pinned, never touched by `governance:update`, and already an entry
point for `knip`, so it is not reported as dead code. If you have a script directly under `scripts/`,
move it: `git mv scripts/<your>.mjs scripts/project/<your>.mjs`.

**Overlays — how you customise a pinned hybrid without touching it:**

| Tool | Core (pinned) | Your overlay (project-owned) |
| --- | --- | --- |
| knip | `knip.config.js` | `knip.project.json` — merged onto the core, arrays unioned |
| ESLint | `eslint.config.mjs` | `eslint.config.project.mjs` — flat-config array, appended after the core |

The generated-bindings case, which is the one you will hit:

```json
// knip.project.json
{ "ignore": ["src/bindings/**"] }
```

**Opt-out — the escape for anything else that is pinned.** A cargo-deny licence, a recorded,
time-boxed advisory exception (`rule:dependencies`), a CI-workflow tweak:

```json
// governance/opt-out.json
{ "paths": ["src-tauri/deny.toml"] }
```

The path leaves the hash pin: you own the file, `governance:update` never overwrites, deletes or
re-pins it, and every gate/update run prints it. **The cost:** that file stops receiving template
fixes. Prefer an overlay; opt out only where no overlay exists.

## 2. Never recreate `knip.json` or `eslint.config.js`

knip resolves `knip.json` **before** `knip.config.js`; ESLint resolves `eslint.config.js` before
`eslint.config.mjs`. Creating one silently replaces the pinned core config while its hash still
matches — a bypass no hash check can see. `governance:check` therefore rejects any such file and names
the overlay your settings belong in. Do not work around it: that is the ban, not an obstacle.

## 3. Project state belongs in `project-scope.md`, never in `CLAUDE.md`

`CLAUDE.md` is pinned core and holds only template-wide facts. What **this** project is — its purpose,
what exists, what deliberately does not — goes in `.claude/memory/project-scope.md`: project-owned,
`load: core`, read at boot. Writing project facts into `CLAUDE.md` drifts the pinned governance entry
point.

## 4. Unpinning is not deleting

A path that left the core but is still shipped by the template is **released** to you on update: your
file stays exactly as you have it, it is no longer pinned, and the update prints it. Only a path the
template actually deleted is deleted downstream. Had local content in a removed file (e.g. your old
`knip.json`)? Recover it with `git show HEAD:<path>` and move the settings into the overlay.

## 5. When the drift-gate fires

It prints the three options that actually exist — **overlay**, **upstream it to the template**,
**opt out** — plus `git checkout -- <path>` to restore a pinned file. There is no fourth way. "Edit
the core anyway" is not an option; if the change belongs in the template, make it there and pull it.

## 6. And when you introduce a mechanism yourself

`rule:knowledge-handover` (load: core) binds you the same way it bound this change: enforce it in the
gate where you can, make the failure message teach, place the doc where the affected agent actually
loads it, and **prove** the reachability with
`node scripts/context-for.mjs "<their keywords>" <files they touch>` before you call it done. A
`conditional` rule/ADR/memory with no `triggers` and no `applies-to` is rejected by the gate — nothing
would ever load it. If a project must *act* on a core change, write the next briefing in this folder.
