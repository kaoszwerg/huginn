---
id: ADR-022
title: Agent delegation — model selection and subagent governance inheritance
status: accepted
tldr: "Pick the right model per task (Opus/Sonnet/Haiku), brief each subagent with a task-fit senior persona, and make it inherit + never bypass project governance."
scope: governance
load: core
triggers: [agent, subagent, delegation, model, opus, sonnet, haiku, task]
applies-to: []
supersedes: []
superseded-by: null
---

## Context

The main agent delegates work to subagents. Two failure modes must be prevented: (1) using the wrong
model for a task — wasting capability/cost on trivial work or under-powering critical analysis; and
(2) subagents developing **independently of the project rules**, because they boot without the ADRs,
rules and conventions the main agent follows, and silently work around the standard.

## Decision

**0. When to delegate (default, not optional).** Read-only fan-out — searching across many files,
symbol/string lookup, "where is X used", mechanical extraction — is **delegated by default** to a Haiku
`Explore` agent (Sonnet when it needs judgement), **not** run on the main (Opus) model. Keep work on the
main model only when it needs the full, tightly-coupled task context (e.g. interleaved implementation).
Rationale: the main model is the most expensive; running greps/reads on it wastes budget and forgoes
parallelism. (This ADR was itself prompted by a session where everything ran on Opus — the lesson is
encoded here.)

**1. Model selection (right model per task).** Choose the model to fit the task and set `model`
explicitly on each agent invocation (it overrides the agent definition's default):

- **Opus** — critical, adversarial or deep work: security audits, architecture/code review, test
  design, threat analysis, anything where correctness/rigor dominates.
- **Sonnet** — medium-depth work: feature implementation, exploration that requires judgement,
  multi-step research.
- **Haiku** — broad search and trivial tasks: file/symbol lookup, mechanical extraction, simple edits.

**2. Subagent governance inheritance.** Every subagent is bound by the **same** governance as the main
agent. When delegating, the main agent MUST either (a) instruct the subagent to load the governance —
"read `CLAUDE.md` + the relevant ADRs/rules (use `node scripts/context-for.mjs "<keywords>" <files>`)
per the loading contract" — or (b) pass the concrete applicable rules/constraints inline in the prompt.
Subagents that **write code** must know the full ADRs/rules in scope; read-only search agents need only
what their task touches. Subagents never develop around the project rules; their output is still
subject to `check:all`.

**3. Senior persona per task.** Brief every subagent — and frame the main agent's own work — as a
senior specialist for the task's domain (a senior Rust security engineer for an audit, a senior
release engineer for CI, a senior UX engineer for a view). State the persona in the subagent's prompt.
Senior-level output is the default across the whole agent tree; drop below it only when a lighter
touch is demonstrably the better fit (ADR-002).

## Alternatives

- **Always use the default/inherited model** — rejected: wastes capability on trivial tasks or
  under-powers critical ones.
- **Trust subagents to infer the rules** — rejected: they start without project context and drift from
  the standard, producing non-conforming work (the exact failure ADR-006 guards against for context).

## Consequences

- Deliberate, cost-aware model choices; consistent governance across the whole agent tree.
- The main agent is responsible for briefing every subagent it spawns.
- Subagent results integrate cleanly because they were produced under the same rules.

## References

- ADR-002 (best solution), ADR-006 (context loading), `.claude/rules/agent-delegation.md`,
  `scripts/context-for.mjs`.
