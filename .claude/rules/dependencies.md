---
id: rule:dependencies
title: Dependency addition gate
tldr: "Before adding a dependency: justify it, check license + maintenance health, prefer few/small deps; pin exact versions + commit lockfiles so builds never drift."
scope: global
load: conditional
triggers: [dependency, dependencies, package, add, license, supply-chain, vendor, lockfile, cve, advisory]
applies-to: ["package.json"]
---

# Dependency addition gate (ADR-CORE-009)

- **Justify before adding.** A new dependency is added only when the standard library or an existing
  dependency cannot do the job reasonably; prefer fewer, smaller, well-scoped packages over a large
  transitive tree.
- **License compatibility.** Check the dependency's license against the project license before adding;
  copyleft/incompatible licenses are rejected or escalated to the maintainer. Record anything non-obvious.
- **Maintenance health & security.** Prefer actively maintained dependencies (recent releases,
  responsive advisories); reject anything with a known unpatched CVE. The advisory and lockfile checks
  gate this in `check:all` (rule:security, rule:automation).
- **CVE gate before every push.** Advisory status is checked and green **before** anything is pushed
  (pre-push). A new advisory **blocks the push** and is surfaced to the maintainer, who **decides the
  course** (upgrade, patch, replace, or a recorded, time-boxed exception) — the agent never
  auto-suppresses a finding and never pushes past an unresolved one.
- **A recorded exception is a governed file, not a quiet edit.** Where the exception list lives in a file
  an upstream layer owns, a project changes it by opting that path out (`governance/opt-out.json`,
  ADR-CORE-032) — the exception stays visible in a file the maintainer reviews, and the upstream's
  supply-chain policy is never silently rewritten.
- **Pin to avoid build drift.** Dependencies are declared with **exact** versions (no `^`/`~`), the
  lockfile is committed, and the gate/CI install and build from the lock (`npm ci`, and the equivalent
  `--locked`/frozen flag of every other toolchain in the project). A version bump is deliberate — a
  changed version *and* an updated lockfile — never floating.
- **Version policy is separate.** *Which* version to move to is ADR-CORE-009 (latest stable, verified,
  lockfiles committed); this rule governs *whether* to add the dependency at all.
