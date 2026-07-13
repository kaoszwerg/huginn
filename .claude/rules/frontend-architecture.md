---
id: rule:frontend-architecture
title: Frontend state & data-fetching
tldr: "TanStack Query for IPC/async state, Zustand for client UI state, local for ephemeral; IPC only via typed src/api wrappers, never raw invoke in components."
scope: frontend
load: conditional
triggers: [state, store, zustand, react-query, tanstack, query, data, fetch, invoke, api, hook]
applies-to: ["src/**"]
---

# Frontend state & data-fetching

- **One data layer, clear ownership.** **TanStack Query** owns server/IPC async state (loading,
  error, caching, refetch); **Zustand** owns cross-component client UI state; plain React state owns
  ephemeral local state. Never duplicate server state into a store.
- **IPC only through `src/api`.** Components and hooks call the typed wrappers in `src/api/` (which wrap
  `invoke` with the `ts-rs` bindings) — never raw `invoke` or hand-typed payloads in a component
  (rule:reusability, rule:code-quality).
- **Every async surface handles its states.** Loading, empty and error are handled at the query
  boundary for every view (rule:ui-design); no unhandled promise, no silent failure.
- **Types come from the boundary.** The frontend uses the generated `src/bindings/` types; never
  hand-redeclare a DTO (ADR-CORE-005).
