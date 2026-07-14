/**
 * The recording overlay's only script (ADR-PROJ-004, ADR-PROJ-010).
 *
 * **No React here, on purpose.** The overlay must be on screen within a keystroke; a framework and a
 * component tree would be paid for on every recording and would buy nothing — the overlay renders a
 * dot, a meter and a couple of words. This file exists so those words can be in the user's language
 * and can say **what the app is actually doing** — listening, then working, then done.
 *
 * The language arrives in the URL (`overlay.html#de`) and the state is pushed in via
 * `window.__huginnState(...)`, both set by the backend: the overlay window holds **no IPC capability
 * at all** (least privilege, ADR-CORE-011). It cannot ask; it is told. Nothing else about it can be
 * steered from outside, which is the point — a window that floats over other applications is the last
 * place to accept instructions.
 */

/** The overlay's strings per state, kept here rather than in the locale files: they are the only ones
 * it has, and shipping the whole translation bundle into this window to fetch a handful of keys would
 * defeat its entire reason for existing. */
const STRINGS = {
  de: {
    listening: { state: "Ich höre zu …", hint: "loslassen zum Einfügen" },
    working: { state: "Verarbeite …", hint: "" },
    done: { state: "Eingefügt", hint: "" },
    error: { state: "Nicht erkannt", hint: "" },
  },
  en: {
    listening: { state: "Listening …", hint: "release to insert" },
    working: { state: "Working …", hint: "" },
    done: { state: "Inserted", hint: "" },
    error: { state: "Not recognised", hint: "" },
  },
} as const;

type OverlayLanguage = keyof typeof STRINGS;
type OverlayState = keyof (typeof STRINGS)[OverlayLanguage];

/** The state the overlay is in. Starts at `listening`: the window is only ever shown to begin a
 * recording, and it is reset to `listening` each time the backend shows it. */
let currentState: OverlayState = "listening";

/** The language from the URL fragment, or German — Huginn's first language (ADR-PROJ-010). */
function language(): OverlayLanguage {
  const code = window.location.hash.replace("#", "");
  return code in STRINGS ? (code as OverlayLanguage) : "de";
}

function render(): void {
  // Static property access per state (rather than a computed `[currentState]` index): the state is a
  // closed union, but the object-injection lint cannot see that, and a switch says the same thing safely.
  const s = STRINGS[language()];
  const strings =
    currentState === "working"
      ? s.working
      : currentState === "done"
        ? s.done
        : currentState === "error"
          ? s.error
          : s.listening;
  const state = document.querySelector("[data-overlay-state]");
  const hint = document.querySelector("[data-overlay-hint]");
  if (state) state.textContent = strings.state;
  if (hint) hint.textContent = strings.hint;
  document.documentElement.lang = language();

  // The live input meter belongs to "listening" only — there is no audio arriving once the key is
  // released, so it is hidden while the app works and after it is done.
  const meter = document.querySelector<HTMLElement>("[data-overlay-meter]");
  if (meter) meter.style.display = currentState === "listening" ? "" : "none";

  // The pulse turns to the danger tone when a recording could not be recognised, so a failure reads
  // at a glance rather than looking like a normal "done".
  const pulse = document.querySelector<HTMLElement>(".pulse");
  if (pulse) pulse.style.background = currentState === "error" ? "var(--huginn-danger)" : "";
}

render();
// The window is reused between recordings (shown and hidden, never rebuilt — see the spike report),
// so a language change while it is hidden must still reach it.
window.addEventListener("hashchange", render);

// The backend pushes the state (`listening` → `working` → `done`/`error`) exactly as it pushes the
// language and the level: the overlay holds no IPC capability and cannot subscribe to an event.
(window as Window & { __huginnState?: (state: string) => void }).__huginnState = (state) => {
  if (state in STRINGS.de) {
    currentState = state as OverlayState;
    render();
  }
};

// --- the input-level meter -------------------------------------------------------------------------
//
// The backend pushes the microphone level in here ~20×/s (ADR-PROJ-004): `window.__huginnLevel(v)`,
// `v` the raw peak in 0..1. Same channel as the state and the language — a push from the backend,
// never a request from here.
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
