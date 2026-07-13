// @vitest-environment node
import { describe, it, expect } from "vitest";
import de from "./locales/de.json";
import en from "./locales/en.json";
import { LANGUAGES } from "./index";

/**
 * The locale files are a contract, and this is what enforces it (rule:testing).
 *
 * TypeScript already refuses a locale that is missing a key — `Translations` is derived from the
 * German file. What the type system cannot see is the *content*: an empty string, a key that was
 * translated in one file and left in English in the other, an interpolation placeholder that was
 * dropped in translation so the value it should carry silently vanishes.
 *
 * A user meets those as a blank label or a sentence with a hole in it. The tests meet them here.
 */

/** Flatten `{a: {b: "x"}}` to `{"a.b": "x"}` — nested keys are how the files are written, flat keys
 * are how they are compared. */
function flatten(obj: object, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.set(path, value);
    } else if (value && typeof value === "object") {
      for (const [k, v] of flatten(value, path)) out.set(k, v);
    }
  }
  return out;
}

/** `{{name}}` — the placeholders i18next substitutes. A translation that drops one loses the value. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

const german = flatten(de);
const english = flatten(en);

describe("locales", () => {
  it("ships every language listed in the picker", () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(["de", "en"]);
  });

  it("carries the same keys in every language", () => {
    const missingInEnglish = [...german.keys()].filter((k) => !english.has(k));
    const extraInEnglish = [...english.keys()].filter((k) => !german.has(k));

    expect(missingInEnglish, "keys present in German but missing in English").toEqual([]);
    expect(extraInEnglish, "keys in English that German does not have").toEqual([]);
  });

  it("has no empty translations — a blank label is worse than an untranslated one", () => {
    for (const [file, entries] of [
      ["de", german],
      ["en", english],
    ] as const) {
      for (const [key, value] of entries) {
        expect(value.trim(), `${file}: ${key} is empty`).not.toBe("");
      }
    }
  });

  it("keeps every interpolation placeholder in translation", () => {
    // "About {{name}}" translated to "Über" would silently drop the app's name from the tooltip.
    for (const [key, source] of german) {
      const target = english.get(key);
      expect(target, `${key} missing in English`).toBeDefined();
      expect(placeholders(target ?? ""), `${key}: placeholders differ between de and en`).toEqual(
        placeholders(source),
      );
    }
  });

  it("is actually translated — German and English are not the same file twice", () => {
    // A locale copied and never translated passes every check above. This one catches it: a handful
    // of identical values is normal (proper nouns, "Dev"), a wholesale match is not.
    const identical = [...german].filter(([k, v]) => english.get(k) === v).length;
    expect(identical / german.size).toBeLessThan(0.3);
  });
});
