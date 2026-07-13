# Project rules (project-owned governance line)

Rules specific to **this** project live here. They are indexed and validated by the same governance
scripts as the rules of the layers above (`governance:sync` / `governance:check`), but they belong to no
published layer — the drift-gate does not pin them, so this project owns and freely changes them
(ADR-CORE-033).

Add a `<name>.md` with the same front-matter as any other rule (`id`, `title`, `tldr`, `scope`, `load`,
`triggers`, `applies-to`), then run `npm run governance:sync` to index it. `governance:update` never
touches this folder.

A project rule may cite anything below it (an app-layer rule, a core ADR). The reverse is forbidden: a
lower layer must never depend on a higher one, and `governance:check` rejects it.
