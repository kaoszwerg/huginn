# Bundled model resources

The default speech model is shipped **inside the installer** so a fresh install works without the user
downloading anything (ADR-PROJ-006, rule:model-assets). The model file itself (`ggml-base.bin`, ~147 MB)
is **not committed** — it is fetched and verified into this directory by `npm run prepare:model`, which
`beforeBuildCommand` runs for a release build. See `.gitignore` (`src-tauri/resources/models/*.bin`).

This `README.md` is committed on purpose. `tauri.conf.json` bundles this directory as a resource
(`resources/models/*`), and the Tauri build script validates that glob **at compile time** — a glob that
matches nothing is a hard error, which would break `cargo build`, `check:all` and CI on any checkout that
has not fetched the model. This file keeps the glob non-empty so a plain build never needs the 147 MB
file; `tauri dev` excludes this directory entirely (`tauri.dev.conf.json`).

At runtime the app resolves the model by its exact name (`resources/models/ggml-base.bin`) and verifies it
against the SHA-256 compiled into the binary before use; this README is ignored.
