# Contributing

This is a private, proprietary project (see [LICENSE](LICENSE)). If you have access and
are working on it, follow the conventions below — they are enforced in CI.

## Before you start

Read [`CLAUDE.md`](CLAUDE.md) (onboarding + governance) and the relevant
[ADRs](docs/adr/README.md). Conventions live in [`.claude/rules/`](.claude/rules/INDEX.md).

## Workflow

- **Language:** code, comments and commits in English.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org)
  (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, …).
- **One logical change per commit**, shipping code **+ tests + docs/ADR updates** together.
- **Quality gate:** `npm run check:all` must be green. Pre-commit hooks (husky + lint-staged)
  enforce it — do not bypass with `--no-verify`.
- **Governance docs:** after touching an ADR/rule/memory, run `npm run governance:sync`
  then `npm run governance:check`.
- **Boundary types:** never hand-edit `src/bindings/` — regenerate with `npm run gen:types`.

See the README's [Getting started](README.md#getting-started) for setup, run and build.
