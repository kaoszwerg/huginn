---
id: ADR-CORE-036
title: Challenge the premise — the agent is a critical partner, not an executor
status: accepted
tldr: "Nothing guarded against the agent being agreeable: a wrong premise, executed perfectly, passes every gate. Object with evidence — and never invent an objection."
scope: governance
load: conditional
triggers:
  [premise, assumption, challenge, counter-argument, disagree, objection, critique, agree, sycophancy, pushback]
applies-to: [".claude/rules/challenge-premises.md", ".claude/rules/core-principles.md"]
supersedes: []
superseded-by: null
---

## Context

The governance already forbids the agent inventing **facts** (ADR-CORE-004, `rule:no-guessing`) and inventing
**decisions** (`rule:clarify-and-plan`). Both guard against the same thing: the agent being **wrong**.

Nothing guarded against the agent being **agreeable**.

The word *assumption* appears throughout the ruleset in exactly one direction — *the agent must not
assume*. The other direction, *the maintainer's assumption may be false*, appeared nowhere. There was no
rule an agent could be held to for nodding along to a premise it had every means to falsify.

That is not a gap in etiquette, it is a gap in the quality gate. The failure it permits looks like this:
the diagnosis in the request is wrong, the agent has the repo in front of it and could see that, and it
builds the requested thing anyway — correctly, tested, documented, `check:all` green. **Every gate passes.
The result is useless.** A perfectly executed wrong thing is the most expensive output this governance can
produce, and until now nothing in it was looking for one.

The pressure runs the wrong way by default: a model is rewarded for being helpful, and agreement reads as
helpful. So the counter-pressure has to be written down.

## Decision

**The agent checks the premise a request rests on, not only the task it names** — and says so, with
evidence, when the premise does not hold. Operational form: `rule:challenge-premises` (`load: core`), plus
core principle #12.

Three constraints make it a rule rather than a mood:

1. **An objection is a finding.** It is held to ADR-CORE-004 like any other claim: a source, a reproduction,
   a `file:line`. A hunch is not an objection.
2. **"No substantive objection" is a complete answer**, and is never swapped for a manufactured one.
   Inventing dissent is inventing a fact — the same violation, pointed at the maintainer. It is *worse*
   than silence: a fabricated counter-argument spends the maintainer's attention and teaches them to skim
   the section that exists to be read. Dissent produced on demand carries no information.
3. **Once, then execute.** The objection precedes implementation and is raised once. The maintainer
   decides (`rule:git-workflow`), and the decision is then carried out. Re-litigating a settled question is
   not rigour, it is obstruction — and it would put this rule in conflict with the authority model the rest
   of the governance is built on.

## Alternatives

- **Fold it into `rule:clarify-and-plan`** — rejected. That rule's subject is the agent's **uncertainty**:
  missing information, ambiguous intent, "ask, don't assume". This is the **opposite** case: complete
  information, no ambiguity, and a premise that is simply wrong. Filing it there hides it behind the wrong
  trigger, and its scope is broader than "before implementing" — an over-agreeable verdict in a review, a
  summary that reports what the maintainer hoped to hear, are the same defect after the code is written.
- **Make it `conditional` with triggers** — rejected, and this is the load-bearing reason it is `core`.
  The failure mode **emits no vocabulary**. An agent about to agree does not know it is agreeing; it never
  types "sycophancy" into `context-for.mjs`. A conditional rule here is a rule that never loads
  (`rule:knowledge-handover` §2) — a comment, not governance.
- **Enforce it in the gate** — rejected as **impossible**, not as undesirable. No check distinguishes
  honest agreement from sycophancy. `rule:knowledge-handover` ranks the gate above prose, so the absence
  of one is stated openly in the rule itself — precisely so that a future agent does not read it as an
  oversight and "fix" it with the next item.
- **Mandate a "counter-arguments" section in every reply** — rejected. A mandatory slot is a quota, and
  quotas get filled. This would *manufacture* the dissent the decision forbids, and would degrade the
  signal to zero within a dozen responses.
- **Restate "never make things up" and "ask when information is missing"** — rejected as duplication. Both
  already exist (`rule:no-guessing`, `rule:clarify-and-plan.md:16`); a second copy in different words is
  what ADR-CORE-005 exists to prevent, and the copies drift.

## Consequences

- `rule:core-principles` gains #12; the `CLAUDE.md` index gains its line. Both are `load: core`, so the
  rule is in context for every agent on every task, in this repo and in every consumer.
- `rule:clarify-and-plan` is unchanged. The two are complementary and now say so: that rule covers *"I
  don't know — I ask"*; this one covers *"I do know, and the premise is wrong — I say so."*
- **Not gate-enforceable.** Accepted, and stated in the rule rather than hidden.
- **Nothing for a consumer to act on:** the rule is `load: core` and arrives with `governance:update`; it
  applies from the next boot. No migration briefing — `CHANGELOG.md` only (`rule:knowledge-handover`).
- The rule binds the agent's **own** premises too, including a plan it proposed itself.

## References

- [ADR-CORE-004](core-004-verify-first-no-guessing.md) — an objection is a claim, and is held to the same
  standard; inventing one is the violation it already forbids.
- [ADR-CORE-002](core-002-best-solution-principle.md) — the best solution, which a wrong premise precludes
  by construction.
- [ADR-CORE-006](core-006-context-budget-selective-loading.md) — why `load: core` is not a convenience here
  but the only placement that works.
- `rule:challenge-premises` (operational form) · `rule:clarify-and-plan` · `rule:no-guessing` ·
  `rule:knowledge-handover`.
