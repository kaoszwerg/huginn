import { useEffect } from "react";
import { useSettings } from "./useSettings";
import { LANGUAGES, setLanguage, type LanguageCode } from "../i18n";

/** Is this a language Huginn actually ships? A settings file is user-editable; this is the gate. */
function isKnown(code: string): code is LanguageCode {
  return LANGUAGES.some((l) => l.code === code);
}

/**
 * Apply the user's interface language (ADR-PROJ-010).
 *
 * A language in the settings file that Huginn does not ship — a hand-edit, or a locale removed by a
 * downgrade — falls back to German rather than leaving the interface in raw translation keys.
 */
export function useApplyLanguage() {
  const { data } = useSettings();
  const language = data?.language;

  useEffect(() => {
    if (!language) return;
    setLanguage(isKnown(language) ? language : "de");
  }, [language]);
}
