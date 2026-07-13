---
id: ADR-PROJ-006
title: Model assets — a bundled base model, a catalogue compiled into the binary, and the only network call in the product
status: accepted
tldr: "A small model ships in the installer; bigger ones are a user-clicked download, URL + SHA-256 compiled in. No remote manifest, no ping. Data, never code."
scope: architecture
load: conditional
triggers:
  [
    model,
    models,
    download,
    catalogue,
    catalog,
    checksum,
    sha256,
    whisper,
    gguf,
    network,
    egress,
    update,
    import,
    installer,
    bundle,
  ]
applies-to: ["src-tauri/crates/huginn-models/**", "src-tauri/tauri.conf.json"]
supersedes: []
superseded-by: null
---

## Context

Whisper's useful models range from a few hundred megabytes to several gigabytes. Shipping the largest in
an installer is absurd; shipping none makes a fresh install useless without a network — which would
break the product's own promise that **Huginn works fully offline**.

Downloading anything is also the moment the privacy story is tested. `rule:privacy` bans egress by
default and names "auto-update pings" explicitly. A model update check is such a ping.

And the trust question underneath it: if the *catalogue* is fetched from a server, then the server —
not the signed binary — decides which file, with which hash, is installed. The checksum then only
protects against transmission errors, not against whoever controls the catalogue.

## Decision

- **A small base model ships inside the installer.** Huginn dictates offline from the first launch. Which
  model is chosen by a benchmark on German audio (size vs. quality), not by assumption.
- **The catalogue is compiled into the binary and signed with it.** Each entry carries `id`, `url`,
  `sha256`, `size`, `licence`, `languages`. There is **no remote manifest** and **no update check**. A
  new or better model reaches the user through an **app update** — which the user downloads and runs
  themselves (there is no auto-updater either).
- **The download is triggered by the user, always.** It never happens on first launch, never in the
  background, never "to be helpful".
- **HTTPS, an explicit timeout, no identifiers.** Before the click, the UI states plainly **what leaves
  the device and to whom**: an HTTPS request to a named host, which therefore learns the user's IP
  address. Nothing else. That sentence is a requirement, not marketing copy (rule:privacy).
- **Verify, then use.** The downloaded file's SHA-256 must equal the compiled-in value. A mismatch means
  the file is deleted and the failure surfaced — never used, never "probably fine".
- **Content-addressed storage and an atomic swap.** Models are stored under a name that includes their
  hash, so two versions coexist; the new one is verified **before** the switch, the old one is kept until
  the switch succeeds, and a rollback is possible. Disk space is checked *before* the download starts.
- **The user may import their own model file from disk.** It is *not* verifiable, and the UI says so — it
  is never labelled "verified". The process isolation in ADR-PROJ-005 is what makes this safe to allow.
- **There is no URL input field.** A product that downloads an arbitrary URL on request is a generic
  downloader and a social-engineering vector ("just fetch this model from this link"). Whoever wants a
  model from elsewhere fetches it with a browser and imports the file. No capability is lost; one attack
  surface is.
- **Data may be downloaded. Code never.** GPU backends, DLLs and binaries are shipped with the app.
  Fetching executable code at runtime is a different risk class and is not built.
- **Every step is a Job** (ADR-PROJ-008): download, checksum, load — with progress, an ETA, and a cancel
  button. A progress bar you cannot stop is an insult.

## Alternatives

- **A signed remote catalogue** (Ed25519, public key in the binary) — deferred, not rejected. It decouples
  new models from app releases and, *with* the signature, a compromised CDN still cannot substitute a
  model. It costs a key to protect and a fetch that must stay user-triggered. The catalogue file uses the
  same schema either way, so adopting it later wastes nothing.
- **An unsigned remote catalogue** — rejected: it moves the trust anchor to a server and reduces the
  checksum to an error-detection code.
- **No bundled model (slim installer)** — rejected: it breaks "works without an internet connection".
- **Two installers (slim + offline)** — not now; revisit if installer size becomes a real complaint.

## Consequences

- A new curated model requires an app release. Models appear once or twice a year; releases happen
  anyway. In exchange the privacy statement needs no asterisk: **the only outbound activity in the entire
  product is a model download the user clicked.**
- The installer carries the base model's size and its licence obligations (recorded in the SBOM).
- A user-supplied model is a supported, second-class citizen: allowed, unverifiable, and honestly
  labelled.

## References

- ADR-PROJ-005 (process isolation — what makes an untrusted model file survivable), ADR-PROJ-007
  (storage), ADR-PROJ-008 (jobs), rule:privacy, rule:security, rule:model-assets.
