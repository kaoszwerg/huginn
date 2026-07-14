//! Turning a raw transcript into the text that is actually inserted (ADR-PROJ-005, the "text
//! post-processing" of PLAN.md phase 5).
//!
//! Whisper gives us words and sentence punctuation. It does **not** give us two things a dictation tool
//! needs, and this crate adds them:
//!
//! 1. **Spacing between dictations.** Whisper trims its output, so back-to-back dictations would run
//!    together — "Hallo Welt" then "wie geht's" becoming "Hallo Weltwie geht's". A single trailing space
//!    fixes it, the way every dictation tool does.
//! 2. **Spoken structure commands.** Whisper can never emit a line break from speech; a pause does not
//!    become a newline. So the user says a phrase — "neue Zeile", "neuer Absatz" — and it becomes a real
//!    `\n` / `\n\n`. These are **per language**, because the phrase is: German commands do not fire on
//!    English audio and vice versa.
//!
//! **The transcript is never logged here** (ADR-PROJ-007) — this crate only transforms strings and
//! returns them; it holds nothing and writes nothing.
//!
//! Deliberately **not** here yet: spoken *punctuation* ("Komma" → ",") and special characters. Those are
//! ambiguous — mapping "Komma" to a comma steals the literal word — so they belong behind an opt-in mode,
//! a later increment. Structure commands are safe because nobody dictates the literal words "neue Zeile".

/// Post-process a raw transcript into the text to insert.
///
/// Applies the spoken structure commands for `language` (a BCP-47-ish tag such as `"de"` or `"de-DE"`;
/// an unknown language gets spacing only, no commands), then guarantees a single trailing space so the
/// next dictation cannot stick to this one.
///
/// Empty or whitespace-only input returns an empty string — the caller reads that as "nothing was
/// recognised", and a lone space would both defeat that and scatter spaces through the document.
pub fn process(transcript: &str, language: &str) -> String {
    let commands = commands_for(language);
    let words: Vec<&str> = transcript.split_whitespace().collect();

    let mut out = String::new();
    let mut i = 0;
    while i < words.len() {
        if let Some(command) = match_command_at(&words[i..], commands) {
            // A break absorbs the spaces that would surround it: we want "Satz\nSatz", never "Satz \n
            // Satz". Trim any space we already emitted, then append the control text with none.
            while out.ends_with(' ') {
                out.pop();
            }
            out.push_str(command.replacement);
            i += command.words.len();
        } else {
            // A normal word: separate it from the previous one with a single space — unless we are at the
            // start, or the previous token was a break (which already ends in whitespace).
            if !out.is_empty() && !out.ends_with(char::is_whitespace) {
                out.push(' ');
            }
            out.push_str(words[i]);
            i += 1;
        }
    }

    // The separator for the *next* dictation — but only if we end on a word. If the dictation ended with
    // a paragraph break, the next one should start there, not one space in.
    if !out.is_empty() && !out.ends_with(char::is_whitespace) {
        out.push(' ');
    }
    out
}

/// A spoken command and the control text it becomes.
struct Command {
    /// The phrase, as lowercased words, matched case-insensitively against consecutive transcript words.
    words: &'static [&'static str],
    replacement: &'static str,
}

/// German structure commands. Kept to the phrases nobody dictates literally; extend by adding a row.
const GERMAN: &[Command] = &[
    Command {
        words: &["neue", "zeile"],
        replacement: "\n",
    },
    Command {
        words: &["nächste", "zeile"],
        replacement: "\n",
    },
    Command {
        words: &["neuer", "absatz"],
        replacement: "\n\n",
    },
];

/// English structure commands, for dictation with an English recognition model.
const ENGLISH: &[Command] = &[
    Command {
        words: &["new", "line"],
        replacement: "\n",
    },
    Command {
        words: &["next", "line"],
        replacement: "\n",
    },
    Command {
        words: &["new", "paragraph"],
        replacement: "\n\n",
    },
];

fn commands_for(language: &str) -> &'static [Command] {
    // Match on the primary subtag: "de-DE" and "de" are the same command set.
    match primary_subtag(language).as_str() {
        "de" => GERMAN,
        "en" => ENGLISH,
        _ => &[],
    }
}

/// The part of a language tag before the first `-`, lowercased: `"de-DE"` → `"de"`.
fn primary_subtag(language: &str) -> String {
    language.split('-').next().unwrap_or("").to_lowercase()
}

/// If a command's phrase matches the words starting here, return it — preferring the longest phrase, so
/// a two-word command is never shadowed by a one-word one.
fn match_command_at(words: &[&str], commands: &'static [Command]) -> Option<&'static Command> {
    commands
        .iter()
        .filter(|c| phrase_matches(words, c.words))
        .max_by_key(|c| c.words.len())
}

fn phrase_matches(words: &[&str], phrase: &[&str]) -> bool {
    words.len() >= phrase.len()
        && phrase
            .iter()
            .enumerate()
            .all(|(k, p)| normalise_word(words[k]) == *p)
}

/// Lowercase a token and strip the punctuation whisper may have attached — so `"Zeile."` and `"Neue"`
/// both match their command word. Internal marks (an apostrophe in `"geht's"`) are left alone.
fn normalise_word(word: &str) -> String {
    word.trim_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- spacing -------------------------------------------------------------------------------

    #[test]
    fn a_dictation_gets_a_trailing_space() {
        assert_eq!(process("Hallo Welt", "de"), "Hallo Welt ");
    }

    #[test]
    fn two_dictations_in_a_row_stay_separate_words() {
        // The reported bug: "Hallo Welt" + "wie geht's" was landing as "Hallo Weltwie geht's".
        let inserted = format!(
            "{}{}",
            process("Hallo Welt", "de"),
            process("wie geht's", "de")
        );
        assert_eq!(inserted, "Hallo Welt wie geht's ");
    }

    #[test]
    fn silence_inserts_nothing_not_a_stray_space() {
        assert_eq!(process("", "de"), "");
        assert_eq!(process("   ", "de"), "");
    }

    #[test]
    fn internal_whitespace_is_collapsed() {
        assert_eq!(process("Hallo    Welt", "de"), "Hallo Welt ");
    }

    // --- line commands -------------------------------------------------------------------------

    #[test]
    fn neue_zeile_becomes_a_newline_that_absorbs_its_spaces() {
        assert_eq!(
            process("erste Zeile neue Zeile zweite Zeile", "de"),
            "erste Zeile\nzweite Zeile "
        );
    }

    #[test]
    fn neuer_absatz_becomes_a_blank_line() {
        assert_eq!(
            process("Absatz eins neuer Absatz Absatz zwei", "de"),
            "Absatz eins\n\nAbsatz zwei "
        );
    }

    #[test]
    fn a_command_is_matched_despite_case_and_trailing_punctuation() {
        // Whisper capitalises a sentence start and may end the phrase with a period.
        assert_eq!(
            process("Erster Satz. Neue Zeile. Zweiter Satz", "de"),
            "Erster Satz.\nZweiter Satz "
        );
    }

    #[test]
    fn a_dictation_that_is_only_a_command_becomes_just_the_break() {
        // No trailing space: it ends on whitespace already, and the caller must still treat "\n" as
        // real output, not as silence.
        assert_eq!(process("neue Zeile", "de"), "\n");
    }

    #[test]
    fn several_commands_in_one_dictation() {
        assert_eq!(
            process("eins neue Zeile zwei neuer Absatz drei", "de"),
            "eins\nzwei\n\ndrei "
        );
    }

    #[test]
    fn the_longer_phrase_wins() {
        // "neuer absatz" (paragraph) must not be read as a bare word followed by "absatz".
        assert_eq!(process("x neuer Absatz y", "de"), "x\n\ny ");
    }

    // --- language scoping ----------------------------------------------------------------------

    #[test]
    fn english_commands_fire_on_english() {
        assert_eq!(
            process("first line new line second line", "en"),
            "first line\nsecond line "
        );
    }

    #[test]
    fn a_german_command_does_not_fire_on_english_audio() {
        // "neue Zeile" spoken into an English model is just words, and stays words.
        assert_eq!(
            process("something neue Zeile else", "en"),
            "something neue Zeile else "
        );
    }

    #[test]
    fn an_unknown_language_gets_spacing_only() {
        assert_eq!(process("bonjour le monde", "fr"), "bonjour le monde ");
    }

    #[test]
    fn a_regional_tag_uses_the_base_language_commands() {
        assert_eq!(process("a neue Zeile b", "de-DE"), "a\nb ");
    }
}
