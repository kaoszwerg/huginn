---
id: rule:agent-delegation
title: Agent delegation
tldr: "Pick the right model per task (Opus/Sonnet/Haiku); frame each task + subagent with a task-fit senior persona; subagents inherit + follow the governance."
scope: governance
load: core
triggers: [agent, subagent, delegation, model, spawn, task]
applies-to: []
---

# Agent delegation (ADR-CORE-022)

When the main agent delegates to a subagent:

0. **When to delegate (default, not optional).** Read-only fan-out — searching across many files,
   symbol/string lookup, "where is X used", mechanical extraction — is delegated to a **Haiku** `Explore`
   agent **by default**, not run on the main (Opus) model. Use **Sonnet** when the search needs
   judgement. Only keep work on the main model when it needs the full task context (tightly-coupled
   implementation). Rationale: the main model is the most expensive; running greps/reads on it wastes
   budget and forgoes parallelism.
1. **Right model for the task.** Set `model` explicitly on the call:
   - **Opus** — critical/adversarial/deep: security audit, architecture/code review, test design.
   - **Sonnet** — medium: implementation, judgement-based exploration, multi-step research.
   - **Haiku** — broad search / trivial: file & symbol lookup, mechanical extraction, simple edits.
2. **Governance inheritance.** The subagent is bound by the same rules. In its prompt, either:
   - tell it to read `CLAUDE.md` + the relevant ADRs/rules (run
     `node scripts/context-for.mjs "<keywords>" <files>` and load what it lists), **or**
   - pass the concrete applicable constraints inline.
     Code-writing subagents must know the full in-scope ADRs/rules; read-only search agents need only
     what their task touches.
3. **No bypassing.** Subagents must not develop around the project rules; their output still passes
   `check:all`. The main agent is responsible for briefing every subagent it spawns.
4. **Senior persona — main agent included.** Every task — the main agent's own execution **and** each
   subagent's — is framed as a senior specialist for that task's domain and delivered at senior level;
   state the persona in the subagent's prompt. Drop below senior only when a lighter touch is
   demonstrably the better fit, never as a shortcut. (ADR-CORE-002, ADR-CORE-022)
