# 006 — The push-triggered CI backstop is retired (ADR-CORE-008)

Audience: the agent working in any project that consumes this core.
Layer: **core** (delivered by `governance:update`).

## What changed

The policy was: *"CI re-runs the same `check:all` as a backstop against environment drift."* It is now:

> **Verification runs entirely locally, before the push.** `check:all` as pre-commit + pre-push, and that
> is the whole gate. **GitHub's only job is building final releases** — tag-triggered, all platforms.
> There is **no** push- or PR-triggered workflow that re-runs `check:all`.

## What you must do

**Delete your push-triggered CI workflow.** If your project has one (`.github/workflows/ci.yml` or
similar) that runs `check:all` on `push` / `pull_request`, it is now against policy. Remove it.

- If it came from your upstream layer, it will **disappear on your next `governance:update`** — the
  upstream deleted it, and the update deletes it here. Nothing for you to do.
- If you **opted it out** (`governance/opt-out.json`) or wrote your own, it is yours: delete it, and drop
  the path from the opt-out list.
- **Keep your release workflow.** Tag-triggered (`v*`) / manual dispatch, full platform matrix — that is
  the one remote job the policy still wants.

Then: `npm run governance:sync && npm run check:all`.

## What is now forbidden

- **Adding a push- or PR-triggered workflow that re-runs `check:all`.** If the local gate is missing
  something, **strengthen the local gate**. That is where the coverage belongs, and it is the only place a
  future agent should reach for.
- **Pushing to "see if CI is green".** There is nothing to see. The pre-push hook is the gate; if it
  passed, the push is proven, and if you bypassed it (`--no-verify`), nothing else will catch you
  (rule:git-workflow).

## Read this before you think you are the exception

The rule is safe because of its **premise**: a platform break is not unnoticed — it surfaces in the
**release build**, which runs on every platform you ship to. **That build is the backstop.**

So the rule has exactly one boundary, and it is not a loophole: **a repo that ships no artefact has no
release build, and therefore no backstop.** A repo publishing only governance or tooling has nowhere for a
platform break to surface later; there, a run on a platform nobody develops on is not a repetition of the
local gate — it is the only coverage that exists.

**If your project builds a release, you are not that repo.** You have the backstop. The test is a single
question: *does this repo produce an artefact?* If yes — no push CI. There is nothing to argue about.

## The cost — know it, do not "fix" it

**A break that only appears on another platform is not caught until release time.** A Linux-only build
dependency, a case-sensitive path, a toolchain that behaves differently there — the local run structurally
cannot see any of it, and there is no longer a remote run that can.

That is **accepted, not overlooked** (ADR-CORE-008). The maintainer builds and tests locally before
pushing; the release build is where such a break surfaces. Re-adding a push pipeline is not the fix, and a
future agent must not treat this gap as a bug to close that way.

**Where a platform-specific dependency belongs:** in the layer that has the platform. A native library
that only *your* project needs (an audio backend, a GPU runtime, a system codec) rides in **your** layer —
your release workflow, your build docs. It does not go into a template's workflow, where it would be
installed for every consumer that does not need it. That is what the layers are for
(rule:upstream-changes).

## Why

A push-triggered gate re-derives, on someone else's computer, a result your own machine produced a minute
earlier. Worse, it decays into the *real* gate: people stop trusting the local run and start pushing to
see whether CI goes green — which is exactly the habit the pre-push hook exists to prevent. Remote compute
now does the one thing only it can do: build the release.
