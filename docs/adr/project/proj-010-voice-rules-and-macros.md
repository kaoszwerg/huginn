---
id: ADR-PROJ-010
title: Voice rules — one mechanism for structure commands, spoken punctuation and macros
status: accepted
tldr: "Spoken commands are rules: phrase(s) -> break/paragraph/insert-template. Built-ins seed it; user rules and macros extend it; templates carry placeholders."
scope: architecture
load: conditional
triggers:
  [
    voice,
    command,
    commands,
    rule,
    rules,
    macro,
    macros,
    snippet,
    expansion,
    template,
    placeholder,
    punctuation,
    komma,
    zeile,
    absatz,
    newline,
    paragraph,
    dictionary,
    vocabulary,
    text,
    post-processing,
    cursor,
    clipboard,
  ]
applies-to:
  [
    "src-tauri/crates/huginn-text/**",
    "src-tauri/src/speech/**",
    "src-tauri/src/commands/**",
    "src/views/**",
  ]
supersedes: []
superseded-by: null
---

# ADR-PROJ-010 — Voice rules: structure commands, spoken punctuation and macros

## Context

`huginn-text` began (ADR-PROJ-005, phase 5) as a fixed table of two things: a trailing space between
dictations, and a handful of hard-coded structure commands ("neue Zeile" → a newline). The maintainer
then asked for spoken punctuation ("Komma" → ","), **user-defined** commands, and **macro words** —
spoken triggers that insert a stored passage ("Grußformel" → a whole signature).

These look like four features. They are one. Each is a **rule**: a spoken phrase mapped to an action.
Building them as four hard-coded paths would mean four code paths, four bugs, and a redesign the moment
the user wants to edit any of them. So the decision is to make `huginn-text` a **rule engine** from the
start, and let everything — the built-ins included — be rows in one list.

## Decision

### The rule

A **voice rule** is:

- `phrases: [String]` — one or more trigger phrases. Matched case-insensitively, tolerant of the
  punctuation Whisper attaches, on whole-word boundaries (so "neue Zeile" mid-sentence still fires, but
  "Zeilenende" does not).
- `action`, exactly one of:
  - **`LineBreak`** → `\n`
  - **`Paragraph`** → `\n\n`
  - **`Insert(template)`** → arbitrary text, possibly with placeholders (below). This single action is
    **both** spoken punctuation (`Insert(",")`) **and** macros (`Insert("Mit freundlichen Grüßen, …")`).
- `languages: [String]` — the recognition languages it fires on (`["de"]`, `["en"]`, or `["*"]` for
  every language). A German phrase must not fire on English audio.
- `enabled: bool`, a stable `id`, and `builtin: bool` (so the UI can show built-ins as read-only and let
  them be toggled but not deleted).

The built-in rules are just the default seed of this list:

- **Structure commands** (enabled): the existing German/English newline and paragraph phrases.
- **Spoken punctuation** (built-in but **disabled by default**): "Komma" → ",", "Punkt" → ".",
  "Fragezeichen" → "?", … Off by default on purpose — mapping "Komma" to a comma **steals the literal
  word**, so it lives behind one opt-in toggle, "dictate punctuation". A user who turns it on has chosen
  that trade.

User rules — custom commands and macros — are rows the user adds. There is nothing structurally special
about them; a macro is an `Insert` rule whose template is longer.

### Templates and placeholders

An `Insert` template is literal text (newlines allowed — macros are multi-line) with `{placeholder}`
tokens resolved at insertion time:

- `{date}` / `{time}` — the current date / time, localized.
- `{clipboard}` — the current clipboard text.
- `{cursor}` — where the caret ends up after the text is inserted (at most one per template). "Sehr
  geehrte {cursor}," leaves the caret ready to type the name.
- `{{` and `}}` are literal braces.

### The purity boundary — where placeholders are resolved

`huginn-text` stays **dependency-free and pure** (ADR-PROJ-009): it matches rules and parses templates,
but it does **not** read the clock or the clipboard — those are effects, and they belong where the
capability lives. So the crate takes a resolved **`Context { now, clipboard }`** as input and returns a
**`Processed { text, cursor_from_end }`**. The main crate builds the context (chrono for the clock, the
platform clipboard read), calls the crate, then the injection layer inserts `text` and, if
`cursor_from_end` is set, moves the caret left that many characters. The pure core is fully unit-testable
with a fake context; the effects sit in the one process that already holds those capabilities.

### Precedence

Longest matching phrase wins (so "neuer Absatz" is never read as a bare word plus "Absatz"). A user rule
whose phrase equals a built-in's **overrides** the built-in. Only `enabled` rules match.

### Persistence and editing

User rules and the punctuation toggle live in the **on-device settings JSON** (ADR-PROJ-007). Nothing
about them leaves the device (rule:privacy) — they are edited entirely in the app, in a Voice Commands
settings section, alongside a general Help / documentation view that finally makes push-to-talk, the
hotkey, the privacy promise and the commands discoverable in-product rather than in a maintainer's head.

## Trust boundaries (rule:security)

- **`{clipboard}`** reads the clipboard when a macro that uses it fires — local, user-triggered (the user
  spoke the macro), **never logged** (ADR-PROJ-007) and never sent anywhere. It is the user's own
  clipboard going into the user's own document; no new egress, no new stored secret.
- **Macros insert text only** — never a command, a shell string or a URL that acts. An `Insert` template
  is data the user authored, treated as data.
- **`{cursor}`** moves the caret with synthesized arrow keys — the same capability and trust as the
  existing keystroke injection (ADR-PROJ-004), nothing new.
- A user-defined phrase cannot be made to fire a *different* user's rule: rules are per-install,
  on-device, and never shared.

## Consequences

- One code path, one set of tests, for built-ins and user rules alike; adding a rule kind later (a regex
  trigger, a conditional macro) is a new `action`, not a new subsystem.
- The IPC gains a rules DTO (ts-rs) and CRUD commands; the settings document gains a `rules` list and a
  `dictate_punctuation` flag. Both are versioned by the settings' own `#[serde(default)]` tolerance, so an
  older settings file loads unchanged.
- `{clipboard}` and `{cursor}` add a clipboard read and a caret move to the injection path; both are
  platform trait methods (Windows now, macOS with phase 1b), never hard-coded.

## Alternatives rejected

- **Four hard-coded features.** Rejected: it forecloses user editing and duplicates the matcher four
  times.
- **Resolving placeholders inside `huginn-text`.** Rejected: it would drag a clock and clipboard
  dependency into a crate whose whole value is being pure and testable.
- **Spoken punctuation on by default.** Rejected: it silently removes the ability to dictate the literal
  words "Komma", "Punkt" — a surprise the user did not ask for. Opt-in only.
