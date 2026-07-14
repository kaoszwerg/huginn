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

// --- the input-level meter -------------------------------------------------------------------------
//
// The backend pushes the microphone level in here ~20×/s (ADR-PROJ-004): `window.__huginnLevel(v)`,
// `v` the raw peak in 0..1. The overlay holds no IPC capability and cannot subscribe to an event, so it
// is *told* the level exactly as it is told its language — via a push from the backend, never a request
// from here. This function is the only surface that push touches.
//
// It only stores a target; a requestAnimationFrame loop eases the bars toward it, so the meter is
// smooth between the 50 ms pushes and settles gently when a recording ends.

const bars = Array.from(document.querySelectorAll<HTMLElement>("[data-overlay-meter] .bar"));
let target = 0;
let shown = 0;

/** Map the raw microphone peak to a fuller, more legible bar level — quiet speech should still move it. */
function perceptual(level: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, level) * 2.5));
}

(window as Window & { __huginnLevel?: (level: number) => void }).__huginnLevel = (level) => {
  target = perceptual(level);
};

function animateMeter(): void {
  // Fast attack, slower release — the way a level meter should feel.
  const rate = target > shown ? 0.5 : 0.16;
  shown += (target - shown) * rate;

  const count = bars.length;
  bars.forEach((bar, i) => {
    const fill = Math.max(0, Math.min(1, shown * count - i));
    bar.style.transform = `scaleY(${(0.18 + 0.82 * fill).toFixed(3)})`;
    bar.style.opacity = (0.35 + 0.65 * fill).toFixed(3);
  });

  requestAnimationFrame(animateMeter);
}

if (bars.length > 0) requestAnimationFrame(animateMeter);
