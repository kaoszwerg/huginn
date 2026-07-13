/** Application display name — single source for all frontend labels (ADR-CORE-005). Synced from
 * app.identity.json by `identity:sync` (ADR-APP-031); do not hand-edit the value. */
export const APP_NAME = "Huginn";

/** Tagline — single source for the title bar and the About dialog (ADR-CORE-005). */
export const APP_TAGLINE = "Local voice input. Private by design.";

/** One-paragraph description shown in the About dialog (synced from app.identity.json). */
export const APP_DESCRIPTION =
  "Huginn is a fully local, system-wide voice input for Windows and macOS. It turns speech into text on the device and inserts it into the active application — no cloud, no telemetry, no stored recordings.";
