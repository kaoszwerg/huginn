---
id: rule:code-quality
title: Code quality
tldr: "Fix on sight; typed errors, no silent catches; small focused modules; strict lint/format; no dead code; never weaken a gate you do not own."
scope: global
load: conditional
triggers: [quality, error, lint, refactor, clean, unused, dead-code, config, overlay, gate]
applies-to: []
---

# Code quality (ADR-CORE-002, ADR-CORE-008)

- **Fix on sight:** every bug you find is fixed as part of the current change, regardless of which
  session or author introduced it — origin is never an excuse to ignore it. If a fix is genuinely out of
  scope, surface and track it immediately (rule:clarify-and-plan); never leave it silent (ADR-CORE-002).
- **Errors:** typed, propagated errors — never a stringly-typed catch-all. No panic/abort on a fallible
  production path (tests may take the shortcut). No swallowed errors: log **and** surface
  (rule:logging).
- **Structure:** small, single-responsibility modules and functions; clear names; no commented-out code.
- **Lint & format are gates, not suggestions:** the project's formatter and linter run in `check:all`
  with zero tolerated warnings. A warning you cannot fix is discussed, not silenced.
- **Dead code: none.** The unused-code check is part of the gate and must be clean.
- **Never weaken a gate you do not own.** Tooling config is layered (ADR-CORE-032): a config file an upstream
  layer owns is **read-only here**. Project-specific settings go into the overlay the core provides
  (`eslint.config.project.mjs`, `knip.project.json` — merged *on top*, additively). Creating a
  higher-priority config file instead (`knip.json`, `eslint.config.js`) silently **shadows** the governed
  one without drifting its hash — `governance:check` rejects exactly that and names the overlay. If no
  overlay exists for what you need, opt the path out explicitly (`governance/opt-out.json`) so the
  divergence is visible; never make a finding disappear by quietly disarming its check.
- **Boundaries stay typed.** Where two runtimes meet (a frontend and a backend, a service and a client),
  the contract is generated or checked — never hand-copied on both sides (ADR-CORE-005).
