import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";

/**
 * Huginn speaks German first (ADR-PROJ-010).
 *
 * The product is a German dictation tool built for a German-speaking maintainer; English is the
 * second language, not the source one. That ordering matters in practice: `de` is the **fallback**,
 * so a key that has not been translated yet shows German text rather than a raw key like
 * `settings.recording.title` — a missing translation should degrade to a language, not to debug
 * output.
 *
 * ## Adding a language
 *
 * 1. Copy `locales/de.json` to `locales/<code>.json` and translate the values.
 * 2. Import it here and add it to `resources` + `LANGUAGES`.
 *
 * That is the whole procedure. There is no key list to maintain by hand: `Translations` is derived
 * from the German file, so **TypeScript refuses to compile a locale that is missing a key** — the
 * gate catches a half-translated language before a user meets it (rule:code-quality).
 */

/** The shape of a locale file — derived from German, which is the complete one by definition. */
type Translations = typeof de;

/** Every language Huginn ships. The `label` is written in that language, as language pickers should be. */
export const LANGUAGES = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** A locale must be complete; the type is what enforces it. */
const resources: Record<LanguageCode, { translation: Translations }> = {
  de: { translation: de },
  en: { translation: en },
};

void i18next.use(initReactI18next).init({
  resources,
  lng: "de",
  fallbackLng: "de",
  interpolation: {
    // React escapes for us; i18next doing it again would double-escape an umlaut in an attribute.
    escapeValue: false,
  },
});

export { i18next };

/**
 * Switch the interface language.
 *
 * Also stamps `<html lang>`, which is not cosmetic: a screen reader picks its pronunciation from it,
 * and CSS hyphenation and `:lang()` rules key off it.
 */
export function setLanguage(code: LanguageCode): void {
  void i18next.changeLanguage(code);
  document.documentElement.lang = code;
}
