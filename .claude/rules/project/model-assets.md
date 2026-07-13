---
id: rule:model-assets
title: Model assets & the download
tldr: "Models are data: URL + SHA-256 compiled in, verified before use, fetched only on a click. Code is never downloaded; an imported model is never called verified."
scope: architecture
load: conditional
triggers:
  [
    model,
    models,
    download,
    downloader,
    catalogue,
    catalog,
    checksum,
    sha256,
    hash,
    verify,
    whisper,
    gguf,
    ggml,
    import,
    installer,
    bundle,
    egress,
    http,
    https,
    url,
    update,
  ]
applies-to: ["src-tauri/crates/huginn-models/**", "src-tauri/tauri.conf.json"]
---

# Model assets & the download (ADR-PROJ-006)

**This is the only place in Huginn that opens a network connection.** Everything in this rule exists to
keep that sentence true.

## The catalogue

- **It is compiled into the binary and signed with it.** `id`, `url`, `sha256`, `size`, `licence`,
  `languages`. There is **no remote manifest** and **no update check** — an update check is a phone-home,
  and `rule:privacy` names "auto-update pings" explicitly.
- **A new model reaches the user through an app update**, which the user downloads and runs. There is no
  auto-updater.
- Do not "just quickly" fetch the catalogue from a server. The moment it is remote, the server — not the
  signed binary — decides which file with which hash gets installed, and the checksum degrades into an
  error-detection code.

## The download

- **User-triggered, always.** Never on first launch, never in the background, never "to be helpful".
- **HTTPS with an explicit timeout. No identifiers, no headers that fingerprint.**
- **Say what leaves the device, before the click.** An HTTPS request to a named host, which therefore
  learns the user's IP address. That sentence belongs in the UI, not in a policy document.
- **Verify, then use.** The file's SHA-256 must equal the compiled-in value. A mismatch → delete the file,
  surface the failure. Never "probably fine".
- **Content-addressed storage, atomic swap**: the new model is verified *before* the switch, the old one
  survives until the switch succeeds, and a rollback is possible. Check free disk space **before**
  starting.
- **Every step is a Job** (rule:jobs): download, checksum, load — with progress, an ETA and a working
  cancel button.

## The two things that must never be built

- **No URL input field.** A product that downloads an arbitrary URL on request is a generic downloader and
  a social-engineering vector ("just fetch this model from this link"). Whoever wants a model from
  elsewhere fetches it with a browser and imports the file.
- **No downloaded code.** A model is *data*. A DLL, a GPU backend or a plugin is *code*, and fetching code
  at runtime is a different risk class entirely. Backends are shipped with the app.

## Imported models

- The user may import a model file from disk. It is **not verifiable** — we have no expected hash — and
  the UI must say so. It is never labelled "verified".
- What makes this safe to allow is the process boundary: the model is parsed in the deprivileged worker,
  not in the process that owns the microphone and the keyboard (rule:speech-and-privacy).
