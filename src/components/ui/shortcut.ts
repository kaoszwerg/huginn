/**
 * The shortcut syntax shared by the recorder and the backend.
 *
 * It lives in its own module (not in `HotkeyField.tsx`) for two reasons: a component file that also
 * exports plain functions breaks React Fast Refresh, and this *is* a contract rather than a piece of
 * UI — the Rust side parses exactly these strings (`spike::hotkey`, pinned by a test on both sides).
 */

/**
 * Keys that are *only* modifiers. While one of these is the key that went down, the combination is
 * unfinished — the user is still reaching for the real key.
 */
const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/** The parts of a keyboard event this needs — narrowed so it can be tested without a DOM. */
export interface KeyChord {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Turn a key press into the shortcut syntax the backend parses (`Ctrl+Space`, `Ctrl+Shift+KeyJ`).
 *
 * It uses the **physical** `code`, never `key`. `key` is the character the layout produces, so on a
 * German keyboard the key under the finger at `KeyZ` reports "y" — record that and the shortcut
 * moves when the layout does. `code` is also exactly what `global-hotkey` names its keys, which is
 * why the two sides agree.
 *
 * Returns `null` while only modifiers are held: that is not a combination yet.
 */
export function toShortcutSpec(e: KeyChord): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (e.metaKey) parts.push("Super");
  parts.push(e.code);
  return parts.join("+");
}

/** Render a spec as something a human reads: `Ctrl+Shift+KeyJ` → `Ctrl + Shift + J`. */
export function humaniseShortcut(spec: string): string {
  return spec
    .split("+")
    .map((part) => part.replace(/^Key/, "").replace(/^Digit/, ""))
    .join(" + ");
}
