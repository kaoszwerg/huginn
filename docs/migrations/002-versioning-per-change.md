# 002 — Version bumps follow the change, not the release (ADR-024)

**Audience: the agent working in a project built on this template.** Read this before your next commit
and before anyone says the word "build". Two things changed: **when you bump** (now: every change) and
**what a bump writes** (now: `Cargo.lock` too — the bug that broke `--locked` builds).

## 1. What changed

| | before | now |
| --- | --- | --- |
| Bump trigger | the release event ("never bump per commit") | **every landing change**, by its Conventional-Commit type |
| Bump command | `npm version <x>` (commits **and tags**) | `npm version <x> --no-git-tag-version` (no commit, no tag) |
| Release | inferable from "this version is done" | **only** on the maintainer's explicit instruction |
| Version sync | `Cargo.toml` | `Cargo.toml` **+ `Cargo.lock`**, both gated by `version:check` |

Why: the old rule froze whole products at `0.1.0` — the number said what was last released, not what the
work was. The version now reflects the work; the *release* stays a deliberate act of the maintainer. The
"a released tag is final — reopen the next patch at once" rule is unchanged and still binding.

## 2. What you do from now on

Bump **before** you commit, so version and content land as one commit:

```bash
npm version minor --no-git-tag-version   # feat:            (pre-1.0: 0.(x+1).0)
npm version patch --no-git-tag-version   # fix:/perf:/refactor:
npm version major --no-git-tag-version   # ! / BREAKING CHANGE
# → package.json bumped; src-tauri/Cargo.toml + src-tauri/Cargo.lock synced and staged
# add the CHANGELOG entry under ## [Unreleased], then commit code + version together
git commit -m "feat(x): …"
```

`docs:`/`chore:`/`test:`-only changes do not bump. A change carrying several types takes the highest.

## 3. What is now forbidden

- **Never tag or release on your own.** "Mach einen Build", "das ist fertig", "push das" are **not**
  release instructions: build and push, do **not** date the changelog, do **not** create a `vX.Y.Z` tag.
  A release happens only when the maintainer explicitly asks for one — then: move `## [Unreleased]` to
  `## [X.Y.Z] - YYYY-MM-DD`, commit, `git tag vX.Y.Z`, `git push --follow-tags`, and **immediately**
  reopen with `npm version patch --no-git-tag-version`.
- **Never run plain `npm version <x>`** — it creates a commit *and* a tag. Always
  `--no-git-tag-version`.
- **Never hand-edit a version** in `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` or
  `src-tauri/tauri.conf.json`. `package.json` is the SSOT; `scripts/sync-version.mjs` writes the rest.
  `npm run version:check` (part of `check:all`) fails on drift in **either** Rust file.

## 4. The `Cargo.lock` bug this fixes — and your `package.json`

The old `version` lifecycle hook synced `Cargo.toml` only. The lock kept the old number, and the next
Rust step — all of them build with `--locked` — died with:

```
error: the lock file … needs to be updated but --locked was passed to prevent this
```

With per-change bumps that would hit on *every* change instead of once per release. Fixed in the pinned
core: `scripts/sync-version.mjs` now writes the crate's `[[package]]` entry in `Cargo.lock` as well, and
stages what it wrote when npm's `version` lifecycle runs it. `governance:update` delivers that script —
you get the fix without editing anything.

**`package.json` is project-owned, so the template cannot update it for you.** Your hook still reads:

```json
"version": "node scripts/sync-version.mjs && git add src-tauri/Cargo.toml CHANGELOG.md"
```

That keeps working (the script stages the lock itself), but simplify it to the template's form — one
source, no stale file list:

```json
"version": "node scripts/sync-version.mjs"
```

If you already patched a `cargo update -p <crate>` call into that hook, **remove it**: it is redundant,
needs a cargo binary at bump time, and re-resolves dependencies you did not ask to touch.

## 5. If you opted the bump-trigger memory out

Some forks put `.claude/memory/version-bump-trigger.md` into `governance/opt-out.json` because the pinned
core still taught the old policy. The core now teaches the new one — take it back:

```bash
# remove ".claude/memory/version-bump-trigger.md" from governance/opt-out.json
npm run governance:update    # re-pins and restores the core memory
npm run governance:check
```

## 6. First run after the update

Your lock may already be stale from an earlier hand-bump. Settle it in one step and commit it:

```bash
npm run version:sync    # writes package.json's version into Cargo.toml + Cargo.lock
npm run check:all       # version:check is now part of the gate for BOTH files
```
