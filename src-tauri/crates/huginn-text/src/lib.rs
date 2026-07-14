//! Turning a raw transcript into the text that is actually inserted — as a **rule engine**
//! (ADR-PROJ-010).
//!
//! Every spoken command is a [`Rule`]: trigger phrase(s) → an [`Action`]. That one idea covers all of
//! it — a newline ("neue Zeile"), a paragraph, spoken punctuation ("Komma" → ","), and macros
//! ("Grußformel" → a whole signature). The built-ins are just the default rules; the user adds more.
//!
//! **This crate is pure and dependency-free** (ADR-PROJ-009). It never reads the clock or the clipboard —
//! those are effects, and they belong in the process that holds the capability. The caller resolves them
//! into a [`Context`] and passes it in; the crate substitutes and returns [`Processed`], including where
//! the caret should land. So the whole engine is unit-testable with a fake context.
//!
//! **The transcript is never logged here** (ADR-PROJ-007) — this crate only transforms strings.

// ---------------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------------

/// What a rule does when its phrase is spoken.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// A single line break.
    LineBreak,
    /// A blank line — two breaks.
    Paragraph,
    /// Insert a template: literal text (newlines allowed) with `{date}`/`{time}`/`{clipboard}`/`{cursor}`
    /// placeholders. This is both spoken punctuation (`Insert(",")`) and macros.
    Insert(String),
}

/// A rule the engine matches against the transcript.
#[derive(Debug, Clone)]
pub struct Rule {
    /// Trigger phrases; any one firing the action. Matched case-insensitively, punctuation-tolerant.
    pub phrases: Vec<String>,
    pub action: Action,
    /// Recognition languages this fires on: `["de"]`, `["en"]`, or `["*"]` for every language.
    pub languages: Vec<String>,
    pub enabled: bool,
}

/// Runtime values a template may need, resolved by the caller (the crate stays pure).
#[derive(Debug, Clone, Default)]
pub struct Context {
    /// The current date, already localized by the caller.
    pub date: String,
    /// The current time, already localized.
    pub time: String,
    /// The current weekday name, already localized.
    pub weekday: String,
    /// The current clipboard text.
    pub clipboard: String,
}

/// Which built-in rule sets are active.
#[derive(Debug, Clone, Copy, Default)]
pub struct Options {
    /// When true, the built-in spoken-punctuation rules ("Komma" → ",") are active. Off by default,
    /// because mapping "Komma" to a comma steals the literal word (ADR-PROJ-010).
    pub dictate_punctuation: bool,
}

/// The processed output.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Processed {
    /// The text to insert.
    pub text: String,
    /// If a `{cursor}` placeholder was used, move the caret left this many characters after inserting,
    /// so it lands where the user asked. `None` means "leave the caret at the end".
    pub cursor_from_end: Option<usize>,
}

// ---------------------------------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------------------------------

/// Post-process a raw transcript into the text to insert.
///
/// Assembles the effective rules — built-in structure commands, built-in punctuation (iff
/// `options.dictate_punctuation`), and the user's own, all filtered to `language` — and applies them,
/// longest phrase first, a user rule overriding a built-in. Then guarantees a trailing space so the next
/// dictation cannot stick to this one.
///
/// Empty or whitespace-only input returns an empty string — the caller reads that as "nothing was
/// recognised".
pub fn process(
    transcript: &str,
    language: &str,
    user_rules: &[Rule],
    options: &Options,
    ctx: &Context,
) -> Processed {
    let candidates = candidates_for(language, user_rules, options);
    let words: Vec<&str> = transcript.split_whitespace().collect();

    let mut out = String::new();
    let mut out_chars: usize = 0;
    let mut cursor_abs: Option<usize> = None;
    let mut i = 0;

    while i < words.len() {
        if let Some(cand) = match_at(&words[i..], &candidates) {
            match &cand.action {
                Action::LineBreak => push_break(&mut out, &mut out_chars, "\n"),
                Action::Paragraph => push_break(&mut out, &mut out_chars, "\n\n"),
                Action::Insert(template) => {
                    let (text, cursor) = render_template(template, ctx);
                    let start = push_insert(&mut out, &mut out_chars, &text);
                    if let Some(off) = cursor {
                        cursor_abs = Some(start + off);
                    }
                }
            }
            i += cand.word_count;
        } else {
            push_word(&mut out, &mut out_chars, words[i]);
            i += 1;
        }
    }

    // The separator for the next dictation — unless we already end on a break.
    if out_chars > 0 && !out.ends_with(char::is_whitespace) {
        out.push(' ');
        out_chars += 1;
    }

    Processed {
        cursor_from_end: cursor_abs.map(|pos| out_chars.saturating_sub(pos)),
        text: out,
    }
}

// ---------------------------------------------------------------------------------------------------
// Emitting, with spacing that reads right
// ---------------------------------------------------------------------------------------------------

/// Symbols that hug the word **before** them, with no space in front — a comma follows its word
/// ("Hallo," not "Hallo ,"), and so does a closing bracket.
const ATTACH_LEFT: &str = ",.;:!?%)]}";
/// Symbols that hug the word **after** them, with no space behind — an opening bracket opens straight
/// onto its word ("(wort" not "( wort").
const ATTACH_RIGHT: &str = "([{";
/// Connectors that hug on **both** sides — a hyphen, slash or at-sign has no space either way
/// ("wort-teil", "name@host", "und/oder").
const ATTACH_BOTH: &str = "-/@#&";

/// True if the char immediately before the cursor lets the next token join with no space.
fn joins_after(out: &str) -> bool {
    out.chars()
        .last()
        .is_some_and(|c| ATTACH_RIGHT.contains(c) || ATTACH_BOTH.contains(c))
}

/// A normal word: one space before it, unless we are at the start, just emitted a break, or the last
/// thing emitted was an opening bracket or a connector it should hug.
fn push_word(out: &mut String, out_chars: &mut usize, word: &str) {
    if *out_chars > 0 && !out.ends_with(char::is_whitespace) && !joins_after(out) {
        out.push(' ');
        *out_chars += 1;
    }
    out.push_str(word);
    *out_chars += word.chars().count();
}

/// A break absorbs the spaces that would surround it: "Satz\nSatz", never "Satz \n Satz".
fn push_break(out: &mut String, out_chars: &mut usize, control: &str) {
    while out.ends_with(' ') {
        out.pop();
        *out_chars -= 1;
    }
    out.push_str(control);
    *out_chars += control.chars().count();
}

/// Inserted template text. Its spacing follows the symbol categories above: text starting with a
/// left-hugging or connecting symbol (",", ")", "@") takes no space before it — "Hallo Komma" → "Hallo,",
/// "Klammer zu" → ")"; a macro that starts with a letter is spaced like a word. The space *after* is not
/// decided here — the next [`push_word`]/[`push_insert`] reads the last char and hugs it if it should.
/// Returns the character position at which the inserted text begins, for cursor tracking.
fn push_insert(out: &mut String, out_chars: &mut usize, text: &str) -> usize {
    let attaches_left = text
        .chars()
        .next()
        .is_some_and(|c| ATTACH_LEFT.contains(c) || ATTACH_BOTH.contains(c));
    if *out_chars > 0 && !out.ends_with(char::is_whitespace) && !attaches_left && !joins_after(out)
    {
        out.push(' ');
        *out_chars += 1;
    }
    let start = *out_chars;
    out.push_str(text);
    *out_chars += text.chars().count();
    start
}

// ---------------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------------

/// Render an `Insert` template against the runtime context. Returns the text and, if a `{cursor}` marker
/// was present, the character offset within that text where the caret should land.
fn render_template(template: &str, ctx: &Context) -> (String, Option<usize>) {
    let mut out = String::new();
    let mut chars = 0usize;
    let mut cursor: Option<usize> = None;

    let bytes = template.as_bytes();
    let mut idx = 0;
    let n = bytes.len();
    while idx < n {
        let c = template[idx..].chars().next().unwrap();
        let clen = c.len_utf8();
        match c {
            '{' if template[idx..].starts_with("{{") => {
                out.push('{');
                chars += 1;
                idx += 2;
            }
            '}' if template[idx..].starts_with("}}") => {
                out.push('}');
                chars += 1;
                idx += 2;
            }
            '{' => {
                if let Some(close) = template[idx..].find('}') {
                    let name = &template[idx + 1..idx + close];
                    idx += close + 1;
                    match name {
                        "cursor" => cursor = Some(chars),
                        "date" => {
                            out.push_str(&ctx.date);
                            chars += ctx.date.chars().count();
                        }
                        "time" => {
                            out.push_str(&ctx.time);
                            chars += ctx.time.chars().count();
                        }
                        "weekday" => {
                            out.push_str(&ctx.weekday);
                            chars += ctx.weekday.chars().count();
                        }
                        "clipboard" => {
                            out.push_str(&ctx.clipboard);
                            chars += ctx.clipboard.chars().count();
                        }
                        // An unknown placeholder is left verbatim, so a typo is visible, not swallowed.
                        other => {
                            let literal = format!("{{{other}}}");
                            chars += literal.chars().count();
                            out.push_str(&literal);
                        }
                    }
                } else {
                    // A lone '{' with no closing brace: literal.
                    out.push('{');
                    chars += 1;
                    idx += clen;
                }
            }
            _ => {
                out.push(c);
                chars += 1;
                idx += clen;
            }
        }
    }
    (out, cursor)
}

// ---------------------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------------------

/// A single (phrase → action) matching candidate, its phrase pre-split into lowercased words.
struct Candidate {
    words: Vec<String>,
    word_count: usize,
    action: Action,
    from_user: bool,
}

/// Build the candidate list for a language: user rules first (they win ties), then the built-ins.
fn candidates_for(language: &str, user_rules: &[Rule], options: &Options) -> Vec<Candidate> {
    let mut candidates = Vec::new();

    for rule in user_rules {
        if rule.enabled && applies(&rule.languages, language) {
            push_candidates(&mut candidates, rule, true);
        }
    }
    for rule in builtin_rules(language, options) {
        push_candidates(&mut candidates, &rule, false);
    }
    candidates
}

fn push_candidates(out: &mut Vec<Candidate>, rule: &Rule, from_user: bool) {
    for phrase in &rule.phrases {
        let words: Vec<String> = phrase.split_whitespace().map(normalise_word).collect();
        if words.is_empty() {
            continue;
        }
        out.push(Candidate {
            word_count: words.len(),
            words,
            action: rule.action.clone(),
            from_user,
        });
    }
}

/// Best candidate matching at the start of `words`: longest phrase wins; a user rule beats a built-in of
/// the same length.
fn match_at<'a>(words: &[&str], candidates: &'a [Candidate]) -> Option<&'a Candidate> {
    candidates
        .iter()
        .filter(|c| phrase_matches(words, &c.words))
        .max_by_key(|c| (c.word_count, c.from_user))
}

fn phrase_matches(words: &[&str], phrase: &[String]) -> bool {
    words.len() >= phrase.len()
        && phrase
            .iter()
            .enumerate()
            .all(|(k, p)| normalise_word(words[k]) == *p)
}

/// Lowercase a token and strip the punctuation Whisper attaches — so `"Zeile."` and `"Neue"` both match
/// their command word. Internal marks (the apostrophe in `"geht's"`) are left alone.
fn normalise_word(word: &str) -> String {
    word.trim_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase()
}

/// Does a rule's language list cover this recognition language? `["*"]` covers everything; otherwise the
/// primary subtags must match (`"de"` covers `"de-DE"`).
fn applies(languages: &[String], language: &str) -> bool {
    let base = primary_subtag(language);
    languages
        .iter()
        .any(|l| l == "*" || primary_subtag(l) == base)
}

fn primary_subtag(language: &str) -> String {
    language.split('-').next().unwrap_or("").to_lowercase()
}

// ---------------------------------------------------------------------------------------------------
// Built-in rules — the default seed of the list
// ---------------------------------------------------------------------------------------------------

/// The built-in rules active for a language: structure commands always, punctuation iff opted in.
pub fn builtin_rules(language: &str, options: &Options) -> Vec<Rule> {
    let base = primary_subtag(language);
    let mut rules = Vec::new();
    for spec in STRUCTURE {
        if spec.lang == base {
            rules.push(spec.to_rule());
        }
    }
    if options.dictate_punctuation {
        for spec in PUNCTUATION {
            if spec.lang == base {
                rules.push(spec.to_rule());
            }
        }
    }
    rules
}

/// A built-in rule as static data.
struct Spec {
    lang: &'static str,
    phrases: &'static [&'static str],
    action: BuiltinAction,
}

enum BuiltinAction {
    LineBreak,
    Paragraph,
    Insert(&'static str),
}

impl Spec {
    fn to_rule(&self) -> Rule {
        Rule {
            phrases: self.phrases.iter().map(|p| p.to_string()).collect(),
            action: match self.action {
                BuiltinAction::LineBreak => Action::LineBreak,
                BuiltinAction::Paragraph => Action::Paragraph,
                BuiltinAction::Insert(s) => Action::Insert(s.to_string()),
            },
            languages: vec![self.lang.to_string()],
            enabled: true,
        }
    }
}

const STRUCTURE: &[Spec] = &[
    Spec {
        lang: "de",
        phrases: &["neue zeile", "nächste zeile"],
        action: BuiltinAction::LineBreak,
    },
    Spec {
        lang: "de",
        phrases: &["neuer absatz"],
        action: BuiltinAction::Paragraph,
    },
    Spec {
        lang: "en",
        phrases: &["new line", "next line"],
        action: BuiltinAction::LineBreak,
    },
    Spec {
        lang: "en",
        phrases: &["new paragraph"],
        action: BuiltinAction::Paragraph,
    },
];

const PUNCTUATION: &[Spec] = &[
    Spec {
        lang: "de",
        phrases: &["komma"],
        action: BuiltinAction::Insert(","),
    },
    Spec {
        lang: "de",
        phrases: &["punkt"],
        action: BuiltinAction::Insert("."),
    },
    Spec {
        lang: "de",
        phrases: &["fragezeichen"],
        action: BuiltinAction::Insert("?"),
    },
    Spec {
        lang: "de",
        phrases: &["ausrufezeichen"],
        action: BuiltinAction::Insert("!"),
    },
    Spec {
        lang: "de",
        phrases: &["doppelpunkt"],
        action: BuiltinAction::Insert(":"),
    },
    Spec {
        lang: "de",
        phrases: &["semikolon"],
        action: BuiltinAction::Insert(";"),
    },
    Spec {
        lang: "en",
        phrases: &["comma"],
        action: BuiltinAction::Insert(","),
    },
    Spec {
        lang: "en",
        phrases: &["period", "full stop"],
        action: BuiltinAction::Insert("."),
    },
    Spec {
        lang: "en",
        phrases: &["question mark"],
        action: BuiltinAction::Insert("?"),
    },
    Spec {
        lang: "en",
        phrases: &["exclamation mark"],
        action: BuiltinAction::Insert("!"),
    },
    Spec {
        lang: "en",
        phrases: &["colon"],
        action: BuiltinAction::Insert(":"),
    },
    // Special characters — spoken symbols, part of the same opt-in as punctuation. Kept to phrases
    // nobody dictates as literal words (so "raute", not "Gitter"), and the spacing categories above make
    // the result read right ("(wort)", "name@host", "und/oder").
    Spec {
        lang: "de",
        phrases: &["klammer auf"],
        action: BuiltinAction::Insert("("),
    },
    Spec {
        lang: "de",
        phrases: &["klammer zu"],
        action: BuiltinAction::Insert(")"),
    },
    Spec {
        lang: "de",
        phrases: &["bindestrich"],
        action: BuiltinAction::Insert("-"),
    },
    Spec {
        lang: "de",
        phrases: &["schrägstrich"],
        action: BuiltinAction::Insert("/"),
    },
    Spec {
        lang: "de",
        phrases: &["at zeichen", "at-zeichen"],
        action: BuiltinAction::Insert("@"),
    },
    Spec {
        lang: "de",
        phrases: &["raute"],
        action: BuiltinAction::Insert("#"),
    },
    Spec {
        lang: "de",
        phrases: &["und zeichen"],
        action: BuiltinAction::Insert("&"),
    },
    Spec {
        lang: "de",
        phrases: &["anführungszeichen"],
        action: BuiltinAction::Insert("\""),
    },
    Spec {
        lang: "en",
        phrases: &["open paren", "open parenthesis"],
        action: BuiltinAction::Insert("("),
    },
    Spec {
        lang: "en",
        phrases: &["close paren", "close parenthesis"],
        action: BuiltinAction::Insert(")"),
    },
    Spec {
        lang: "en",
        phrases: &["hyphen"],
        action: BuiltinAction::Insert("-"),
    },
    Spec {
        lang: "en",
        phrases: &["slash", "forward slash"],
        action: BuiltinAction::Insert("/"),
    },
    Spec {
        lang: "en",
        phrases: &["at sign"],
        action: BuiltinAction::Insert("@"),
    },
    Spec {
        lang: "en",
        phrases: &["hash", "pound sign"],
        action: BuiltinAction::Insert("#"),
    },
    Spec {
        lang: "en",
        phrases: &["ampersand"],
        action: BuiltinAction::Insert("&"),
    },
    Spec {
        lang: "en",
        phrases: &["quotation mark"],
        action: BuiltinAction::Insert("\""),
    },
];

// ---------------------------------------------------------------------------------------------------
// For the in-app reference (SSOT — the settings show exactly what the engine acts on)
// ---------------------------------------------------------------------------------------------------

/// One built-in command, described for display in the settings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuiltinInfo {
    /// The phrases that trigger it, as spoken.
    pub phrases: Vec<String>,
    /// What it does: `"line"`, `"paragraph"`, or `"punctuation"`.
    pub kind: String,
    /// For punctuation, the character it inserts; empty otherwise.
    pub inserts: String,
    /// True for the opt-in punctuation set.
    pub punctuation: bool,
}

/// The built-in commands for a language, for the settings reference — including the punctuation set, so
/// the user can see what turning it on would do.
pub fn builtin_reference(language: &str) -> Vec<BuiltinInfo> {
    let base = primary_subtag(language);
    let mut out = Vec::new();
    for spec in STRUCTURE.iter().chain(PUNCTUATION) {
        if spec.lang != base {
            continue;
        }
        let (kind, inserts, punctuation) = match spec.action {
            BuiltinAction::LineBreak => ("line", String::new(), false),
            BuiltinAction::Paragraph => ("paragraph", String::new(), false),
            BuiltinAction::Insert(s) => ("punctuation", s.to_string(), true),
        };
        out.push(BuiltinInfo {
            phrases: spec.phrases.iter().map(|p| p.to_string()).collect(),
            kind: kind.to_string(),
            inserts,
            punctuation,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(text: &str) -> Processed {
        Processed {
            text: text.to_string(),
            cursor_from_end: None,
        }
    }

    fn de(transcript: &str) -> Processed {
        process(
            transcript,
            "de",
            &[],
            &Options::default(),
            &Context::default(),
        )
    }

    // --- spacing -------------------------------------------------------------------------------

    #[test]
    fn a_dictation_gets_a_trailing_space() {
        assert_eq!(de("Hallo Welt"), plain("Hallo Welt "));
    }

    #[test]
    fn two_dictations_in_a_row_stay_separate_words() {
        let inserted = format!("{}{}", de("Hallo Welt").text, de("wie geht's").text);
        assert_eq!(inserted, "Hallo Welt wie geht's ");
    }

    #[test]
    fn silence_inserts_nothing() {
        assert_eq!(de(""), plain(""));
        assert_eq!(de("   "), plain(""));
    }

    // --- structure commands --------------------------------------------------------------------

    #[test]
    fn neue_zeile_becomes_a_newline_absorbing_spaces() {
        assert_eq!(
            de("erste Zeile neue Zeile zweite Zeile"),
            plain("erste Zeile\nzweite Zeile ")
        );
    }

    #[test]
    fn neuer_absatz_becomes_a_blank_line() {
        assert_eq!(de("eins neuer Absatz zwei"), plain("eins\n\nzwei "));
    }

    #[test]
    fn a_command_only_dictation_is_just_the_break() {
        assert_eq!(de("neue Zeile"), plain("\n"));
    }

    #[test]
    fn the_longer_phrase_wins() {
        assert_eq!(de("x neuer Absatz y"), plain("x\n\ny "));
    }

    // --- punctuation (opt-in) ------------------------------------------------------------------

    #[test]
    fn punctuation_is_off_by_default() {
        // "Komma" stays the literal word unless the user opts in.
        assert_eq!(de("Hallo Komma Welt"), plain("Hallo Komma Welt "));
    }

    #[test]
    fn punctuation_attaches_with_no_space_before_it_when_enabled() {
        let opts = Options {
            dictate_punctuation: true,
        };
        let got = process(
            "Hallo Komma Welt Punkt",
            "de",
            &[],
            &opts,
            &Context::default(),
        );
        assert_eq!(got, plain("Hallo, Welt. "));
    }

    // --- user rules ----------------------------------------------------------------------------

    fn macro_rule(phrase: &str, template: &str) -> Rule {
        Rule {
            phrases: vec![phrase.to_string()],
            action: Action::Insert(template.to_string()),
            languages: vec!["de".to_string()],
            enabled: true,
        }
    }

    #[test]
    fn a_macro_word_expands_to_its_passage() {
        let rules = [macro_rule("grußformel", "Mit freundlichen Grüßen")];
        let got = process(
            "Text grußformel",
            "de",
            &rules,
            &Options::default(),
            &Context::default(),
        );
        assert_eq!(got, plain("Text Mit freundlichen Grüßen "));
    }

    #[test]
    fn a_disabled_rule_does_not_fire() {
        let mut rule = macro_rule("grußformel", "…");
        rule.enabled = false;
        let got = process(
            "grußformel",
            "de",
            &[rule],
            &Options::default(),
            &Context::default(),
        );
        assert_eq!(got, plain("grußformel "));
    }

    #[test]
    fn a_user_rule_overrides_a_builtin_of_the_same_phrase() {
        let rules = [macro_rule("neue zeile", "STATTDESSEN")];
        let got = process(
            "neue Zeile",
            "de",
            &rules,
            &Options::default(),
            &Context::default(),
        );
        assert_eq!(got.text, "STATTDESSEN ");
    }

    #[test]
    fn a_rule_scoped_to_german_does_not_fire_on_english() {
        let rules = [macro_rule("grußformel", "x")];
        let got = process(
            "grußformel",
            "en",
            &rules,
            &Options::default(),
            &Context::default(),
        );
        assert_eq!(got, plain("grußformel "));
    }

    // --- templates & placeholders --------------------------------------------------------------

    #[test]
    fn placeholders_are_resolved_from_the_context() {
        let ctx = Context {
            date: "14.07.2026".into(),
            time: "09:30".into(),
            weekday: "Dienstag".into(),
            clipboard: "PASTED".into(),
        };
        let rules = [macro_rule(
            "kopf",
            "{weekday}, {date} um {time}: {clipboard}",
        )];
        let got = process("kopf", "de", &rules, &Options::default(), &ctx);
        assert_eq!(got.text, "Dienstag, 14.07.2026 um 09:30: PASTED ");
    }

    #[test]
    fn spoken_special_characters_hug_their_neighbours() {
        let opts = Options {
            dictate_punctuation: true,
        };
        // A bracketed word: "( wort )" would be wrong — the brackets hug.
        let got = process(
            "klammer auf wort klammer zu",
            "de",
            &[],
            &opts,
            &Context::default(),
        );
        assert_eq!(got, plain("(wort) "));
        // A connector hugs on both sides.
        let mail = process(
            "name at zeichen host",
            "de",
            &[],
            &opts,
            &Context::default(),
        );
        assert_eq!(mail, plain("name@host "));
    }

    #[test]
    fn special_characters_stay_literal_words_when_punctuation_is_off() {
        assert_eq!(de("klammer auf wort"), plain("klammer auf wort "));
    }

    #[test]
    fn a_cursor_placeholder_reports_where_the_caret_lands() {
        // "Sehr geehrte " then cursor then "," — after inserting, the caret sits before the comma.
        let rules = [macro_rule("anrede", "Sehr geehrte {cursor},")];
        let got = process(
            "anrede",
            "de",
            &rules,
            &Options::default(),
            &Context::default(),
        );
        // Output: "Sehr geehrte ," + trailing space = "Sehr geehrte , " (15 chars); caret after
        // "Sehr geehrte " (position 13) → 2 chars from the end.
        assert_eq!(got.text, "Sehr geehrte , ");
        assert_eq!(got.cursor_from_end, Some(2));
    }

    #[test]
    fn escaped_braces_are_literal() {
        let rules = [macro_rule("brace", "{{not a placeholder}}")];
        let got = process(
            "brace",
            "de",
            &rules,
            &Options::default(),
            &Context::default(),
        );
        assert_eq!(got.text, "{not a placeholder} ");
    }

    #[test]
    fn an_unknown_placeholder_is_left_visible() {
        let rules = [macro_rule("x", "a {nope} b")];
        let got = process("x", "de", &rules, &Options::default(), &Context::default());
        assert_eq!(got.text, "a {nope} b ");
    }

    #[test]
    fn a_multiline_macro_keeps_its_newlines() {
        let rules = [macro_rule("sig", "Zeile eins\nZeile zwei")];
        let got = process(
            "sig",
            "de",
            &rules,
            &Options::default(),
            &Context::default(),
        );
        assert_eq!(got.text, "Zeile eins\nZeile zwei ");
    }

    // --- reference -----------------------------------------------------------------------------

    #[test]
    fn the_reference_lists_structure_and_punctuation() {
        let reference = builtin_reference("de");
        assert!(reference
            .iter()
            .any(|r| r.kind == "line" && r.phrases.contains(&"neue zeile".to_string())));
        assert!(reference.iter().any(|r| r.punctuation && r.inserts == ","));
    }
}
