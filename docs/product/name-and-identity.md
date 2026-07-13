# Huginn — name, identity and how we talk about it

This is the product brief, corrected against the decisions that were actually taken. Where the original
brief and an ADR disagree, **the ADR wins and the difference is named here** — a document that quietly
contradicts the code is worse than no document, because it is trusted (rule:documentation).

## The name

**Huginn** — one of Odin's two ravens, the one that stands for thought. He flies out, takes in what is
happening, and brings it back.

It fits because the product takes in speech, processes it **locally**, and hands back usable text. It is
a reason for the name and nothing more: the mythology never justifies listening, storing or profiling.

**Spelling is always `Huginn`.** Never `HUGINN`, `Hugin`, `hugInn`, `HuginN`. In technical identifiers,
lowercase: `huginn`, `huginn-core`, `huginn_config`.

## Official names

```
Product / application    Huginn
Repository               huginn
Executable (Windows)     huginn.exe
App bundle (macOS)       Huginn.app
Bundle identifier        ai.lysis.huginn        (PROVISIONAL — see below)
Vendor                   lysis                  (PROVISIONAL)
Log target               huginn
Config schema            huginn.config.v1
Diagnostics schema       huginn.diagnostics.v1
Event namespace          huginn.event.*
```

The visible product name is **Huginn**. Descriptive suffixes are only used where the purpose must be
explained: _Huginn — Local Voice Input_, _Huginn — Lokale Spracheingabe_.

### The identifier is provisional (ADR-PROJ-002)

The publisher is not decided: the company (`lysis.ai`) or the maintainer's own GitHub org. `ai.lysis.huginn`
is a **working value** — the only candidate that points at a domain that actually exists. It is a tracked
**release blocker**: `npm run release:check` refuses a bundled build until the decision is made.

The identifier is effectively permanent once a user has installed the app: macOS keys the granted
microphone and accessibility permissions to it. That is why the **data directories are not named after
it** (below).

## The one-line definition

> Huginn is a fully local voice input for Windows and macOS. It processes speech on the device, follows
> GDPR, privacy-by-design and security-by-design, and presents the same interface on both platforms.

**Corrected against the original brief:** the brief said Huginn "uses a single shared Rust UI
implementation". It does not. The UI is **Tauri 2 + React** — the reasons, and the pure-Rust toolkits that
were evaluated and rejected, are in **ADR-PROJ-001**. The promise that survives is the one that mattered:
one implementation, the same on both platforms.

## Directories and files (ADR-PROJ-007)

**Lowercase, always** — corrected against the brief, which wrote `Huginn\`. And **named after the
product, not after the identifier**, so the user's settings and their multi-gigabyte model survive the
publisher decision.

| | Windows | macOS |
| --- | --- | --- |
| Config | `%APPDATA%\huginn\huginn.toml` | `~/Library/Application Support/huginn/huginn.toml` |
| Models | `%LOCALAPPDATA%\huginn\models\` | `~/Library/Application Support/huginn/models/` |
| Logs | `%LOCALAPPDATA%\huginn\logs\huginn.log` | `~/Library/Logs/huginn/huginn.log` |
| Cache | `%LOCALAPPDATA%\huginn\cache\` | `~/Library/Caches/huginn/` |

Files: `huginn.toml`, `huginn.log`, `huginn-diagnostics.json`, `huginn-sbom.json`.

Names that must never appear: `LocalDictation`, `SpeechApp`, `VoiceInput`, `DictationTool`.

## Code naming

Rust types: `HuginnApp`, `HuginnConfig`, `HuginnRuntime`, `HuginnState`, `HuginnEvent`, `HuginnError`,
`HuginnPlatform`, `HuginnPaths`, `HuginnDiagnostics`.

Crates: **ADR-PROJ-009** is authoritative, and it deliberately drops several crates the brief proposed
(`huginn-security` and `huginn-privacy` are cross-cutting concerns, not modules; `huginn-ui` has no
contents when the UI is React; the platform split becomes `#[cfg]` modules in one crate). It also **adds**
`huginn-asr-worker` and `huginn-asr-proto` — the deprivileged inference process and its protocol
(ADR-PROJ-005).

## What the interface says

Short status text, no product name in every line:

```
Bereit · Hört zu … · Verarbeitet … · Text eingefügt · Einfügen pausiert · Berechtigung erforderlich
```

## How we talk about privacy

Permitted, because they are true:

```
Huginn verarbeitet Sprache ausschließlich lokal.
Huginn speichert standardmäßig keine Aufnahmen.
Huginn verwendet keine Cloud-Dienste.
Huginn arbeitet nur während einer aktiven Aufnahme.
Huginn sendet keine Telemetrie.
```

Forbidden, because they contradict the product — and the raven must never be used to make surveillance
sound charming:

```
Huginn sieht alles.  ·  Huginn hört immer zu.  ·  Huginn beobachtet dein System.
Huginn erinnert sich an alles.
```

One thing must be said plainly, in the interface, **before** the user clicks: downloading a model is an
HTTPS request to a named host, which therefore learns their IP address. That is the only thing Huginn
ever sends anywhere (ADR-PROJ-006).

## Visual identity (ADR-PROJ-003)

Calm, professional, restrained. A reduced raven silhouette, a stylised feather, a wing-shaped waveform, a
geometric wordmark — all welcome. Viking clichés, runes as body type, helmets, weapons, aggressive
mythology, esoteric symbolism and busy raven illustrations are not.

The look must say: local control, technical precision, reliability, quiet. The recording overlay in
particular sits over someone else's work — it must never look like it wants attention.

**The repo does not have this yet.** It still carries the template's neon HUD look; that is a tracked
release blocker.

## Trademark and name risk

There is already a prominent open-source project called Huginn. Before any publication, the checks the
brief lists must be done and recorded here: software names, trademarks in the target markets, domains,
app-store names, GitHub organisations, likelihood of confusion, product class.

Until then **Huginn is the internal working name**. If a public distinction becomes necessary, prefer a
factual suffix: _Huginn Voice_, _Huginn Dictation_, _Huginn Local_, _Huginn Desktop_. The name is not
changed without a recorded decision — and the check is a **release blocker**, not a to-do.
