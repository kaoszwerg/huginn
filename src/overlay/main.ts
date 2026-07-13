/**
 * The recording overlay's only script (ADR-PROJ-004, ADR-PROJ-010).
 *
 * **No React here, on purpose.** The overlay must be on screen within a keystroke; a framework and a
 * component tree would be paid for on every recording and would buy nothing — the overlay renders a
 * dot and two words. This file exists solely so those two words can be in the user's language.
 *
 * The language arrives in the URL (`overlay.html#de`), set by the backend when it shows the window,
 * because the overlay window holds **no IPC capability at all** (least privilege, ADR-CORE-011): it
 * cannot ask, so it is told. Nothing else about it can be steered from outside, which is exactly the
 * point — a window that floats over other applications is the last place to accept instructions.
 */

/** The overlay's strings, kept here rather than in the locale files: they are the only two it has,
 * and shipping the whole translation bundle into this window to fetch two keys would defeat its
 * entire reason for existing. `i18n.test.ts` pins them against the locales. */
const STRINGS = {
  de: { listening: "Ich höre zu …", hint: "loslassen zum Einfügen" },
  en: { listening: "Listening…", hint: "release to insert" },
} as const;

type OverlayLanguage = keyof typeof STRINGS;

/** The language from the URL fragment, or German — Huginn's first language (ADR-PROJ-010). */
function language(): OverlayLanguage {
  const code = window.location.hash.replace("#", "");
  return code in STRINGS ? (code as OverlayLanguage) : "de";
}

function render(): void {
  const strings = STRINGS[language()];
  const state = document.querySelector("[data-overlay-state]");
  const hint = document.querySelector("[data-overlay-hint]");
  if (state) state.textContent = strings.listening;
  if (hint) hint.textContent = strings.hint;
  document.documentElement.lang = language();
}

render();
// The window is reused between recordings (it is shown and hidden, never rebuilt — see the spike
// report), so a language change while it is hidden must still reach it.
window.addEventListener("hashchange", render);
