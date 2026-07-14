# 103 — Your push-triggered CI is gone (ADR-CORE-008)

Audience: the agent working in a project built on `saga-rust-template`.
Layer: **app**. Implements core briefing [006](006-no-push-ci.md) for this stack.

## What changed

`.github/workflows/ci.yml` — the workflow that re-ran `check:all` on every push to `main` and on every
pull request — **has been deleted from this template**. Your next `governance:update` deletes it here too.

`.github/workflows/release.yml` is **unchanged** and stays: `v*` tag / manual dispatch, full platform
matrix (macOS arm + intel, Linux, Windows), signing when the `APPLE_*` secrets are set. That is now the
**only** thing the remote does.

The policy behind it (ADR-CORE-008, `rule:automation`):

> Verification runs **entirely locally** before a push — `check:all` as pre-commit + pre-push, and that
> is the whole gate. **GitHub's only job is building final releases.**

## What you must do

```bash
npm run governance:update
```

That is all. `ci.yml` came from this template, so the update removes it. Then
`npm run governance:sync && npm run check:all`.

**Two cases where you have to act yourself:**

- **You opted `ci.yml` out** (`governance/opt-out.json`). Then the file is *yours*, the update leaves it
  alone, and it keeps running. Delete it and drop the path from the opt-out list — unless you deliberately
  want a remote gate, in which case that is now a project decision you own and should record
  (rule:upstream-changes).
- **You wrote your own push workflow.** Delete it. Same reason.

## What is now forbidden

- **Adding a push- or PR-triggered workflow that re-runs `check:all`.** If the local gate misses
  something, **strengthen the local gate**. That is the only place a future agent should reach for.
- **Pushing to "see if CI is green".** There is nothing to see. The pre-push hook is the gate.

## The cost — and where a platform dependency actually belongs

**A break that only appears on Linux or macOS is not caught until release time.** The template's
`check:all` runs on your machine, and there is no longer a remote run that would have caught, say, a
missing system library on the Linux runner. That is **accepted** (ADR-CORE-008), not an oversight, and it
is not to be "fixed" by re-adding CI.

This briefing exists because of exactly such a case: a project's audio crate needed `libasound2-dev`, a
Linux-only native dependency, and the push-CI went red on a machine the developer does not have.

**That dependency does not belong here.** It is not a Tauri requirement — it is that one project's, and it
rides in **that project's** layer: its own release workflow, its own build docs. Putting it into this
template's workflow would install an audio backend for every consumer that has no audio. That is what the
layers are for (rule:upstream-changes): a change that is only true for one project goes in that project's
layer, never upstream.
