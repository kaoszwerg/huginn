// Huginn's ESLint overlay (ADR-CORE-032). Appended *after* the pinned core config, which stays
// read-only here — this file is the sanctioned place for a project-specific rule, and it is
// deliberately visible rather than a quiet edit upstream.

/**
 * `no-secrets` scores strings by entropy, and two kinds of string in this project score like a
 * credential without being one:
 *
 *  - **Key combinations** (`"Ctrl+Shift+KeyJ"`) — the push-to-talk syntax, which is a contract with
 *    the Rust side and therefore appears literally in the recorder, the settings view and the tests
 *    that pin it (ADR-PROJ-004).
 *  - **Huginn's own environment switches** (`HUGINN_SPIKE_*`) — long, uppercase, underscore-heavy.
 *
 * The exemption is by *content*, not by file: any string that is not a key combination or one of our
 * variable names is still scanned, everywhere, including in these files. Blanket-disabling the rule
 * for a path would be the move rule:security forbids — never make a finding disappear by disarming
 * the check that produced it.
 */
// Deliberately short patterns: a long, dense regex here scores as high-entropy itself, and the rule
// would flag its own exemption list. (It did. That is why they are written this way.)
const NOT_A_SECRET = [
  // A shortcut spec always carries a modifier joined by "+" to a physical key code.
  "Ctrl\\+",
  "Alt\\+",
  "Shift\\+",
  "Super\\+",
  // Huginn's own environment switches.
  "HUGINN_",
];

export default [
  {
    files: ["src/**/*.{ts,tsx}", "scripts/project/**/*.mjs"],
    rules: {
      "no-secrets/no-secrets": ["error", { ignoreContent: NOT_A_SECRET }],
    },
  },
];
