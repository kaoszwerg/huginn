import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/ui/Panel";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import { Notice } from "../../components/ui/Notice";
import { TextField } from "../../components/ui/TextField";
import { TextArea } from "../../components/ui/TextArea";
import { useSettings } from "../../hooks/useSettings";
import { useBuiltinCommands, useSetDictatePunctuation, useSetRules } from "../../hooks/useSpeech";
import type { VoiceRuleDto } from "../../bindings/VoiceRuleDto";
import type { VoiceActionDto } from "../../bindings/VoiceActionDto";

type ActionKind = VoiceActionDto["kind"];

/** The editor's working copy of a rule while it is being written. */
interface Draft {
  /** The id of the rule being edited, or `null` for a new one. */
  id: string | null;
  phrases: string;
  kind: ActionKind;
  template: string;
  allLanguages: boolean;
  enabled: boolean;
}

/**
 * Voice commands and macros (ADR-PROJ-010). Everything the user speaks that is not dictation: line and
 * paragraph breaks, optional spoken punctuation, and macros — a spoken word that inserts a whole
 * passage. All of it is one mechanism (a rule: phrase → action), and all of it is edited here, on-device.
 */
export function CommandsSection() {
  const { t } = useTranslation();
  const settings = useSettings();

  const builtins = useBuiltinCommands();
  const setRules = useSetRules();
  const setPunctuation = useSetDictatePunctuation();

  const rules = settings.data?.rules ?? [];
  const dictatePunctuation = settings.data?.dictate_punctuation ?? false;
  const recognitionLanguage = settings.data?.recognition_language ?? "de";

  const [draft, setDraft] = useState<Draft | null>(null);

  const startAdd = () =>
    setDraft({
      id: null,
      phrases: "",
      kind: "insert",
      template: "",
      allLanguages: false,
      enabled: true,
    });

  const startEdit = (rule: VoiceRuleDto) =>
    setDraft({
      id: rule.id,
      phrases: rule.phrases.join(", "),
      kind: rule.action.kind,
      template: rule.action.kind === "insert" ? rule.action.template : "",
      allLanguages: rule.languages.includes("*"),
      enabled: rule.enabled,
    });

  const save = () => {
    if (!draft) return;
    const phrases = draft.phrases
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (phrases.length === 0) return;

    const action: VoiceActionDto =
      draft.kind === "insert" ? { kind: "insert", template: draft.template } : { kind: draft.kind };

    const rule: VoiceRuleDto = {
      id: draft.id ?? crypto.randomUUID(),
      phrases,
      action,
      languages: draft.allLanguages ? ["*"] : [recognitionLanguage],
      enabled: draft.enabled,
    };

    const next = draft.id ? rules.map((r) => (r.id === draft.id ? rule : r)) : [...rules, rule];
    setRules.mutate(next, { onSuccess: () => setDraft(null) });
  };

  const remove = (id: string) => setRules.mutate(rules.filter((r) => r.id !== id));
  const setEnabled = (id: string, enabled: boolean) =>
    setRules.mutate(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));

  const templateInvalid = draft?.kind === "insert" && draft.template.trim().length === 0;
  const phrasesInvalid =
    (draft?.phrases
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean).length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <Panel label={t("commands.yourTitle")} info={<p>{t("commands.info")}</p>}>
        <div className="flex flex-col gap-2">
          {rules.length === 0 && !draft ? (
            <p className="text-dim text-xs">{t("commands.yourEmpty")}</p>
          ) : null}

          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onEdit={() => startEdit(rule)}
              onDelete={() => remove(rule.id)}
              onToggle={(enabled) => setEnabled(rule.id, enabled)}
              disabled={setRules.isPending}
            />
          ))}

          {draft ? (
            <div className="border-line flex flex-col gap-3 rounded-[var(--radius-control)] border p-3">
              <Field label={t("commands.phrasesLabel")} hint={t("commands.phrasesHint")}>
                <TextField
                  aria-label={t("commands.phrasesLabel")}
                  placeholder={t("commands.phrasesPlaceholder")}
                  value={draft.phrases}
                  onChange={(e) => setDraft({ ...draft, phrases: e.target.value })}
                  data-testid="commands-phrases"
                />
              </Field>

              <Field label={t("commands.actionLabel")}>
                <div className="flex flex-wrap gap-1">
                  {(["line", "paragraph", "insert"] as ActionKind[]).map((kind) => (
                    <Button
                      key={kind}
                      variant="ghost"
                      active={draft.kind === kind}
                      aria-pressed={draft.kind === kind}
                      onClick={() => setDraft({ ...draft, kind })}
                    >
                      {t(`commands.action_${kind}`)}
                    </Button>
                  ))}
                </div>
              </Field>

              {draft.kind === "insert" ? (
                <Field label={t("commands.templateLabel")} hint={t("commands.placeholderHelp")}>
                  <TextArea
                    aria-label={t("commands.templateLabel")}
                    placeholder={t("commands.templatePlaceholder")}
                    value={draft.template}
                    onChange={(e) => setDraft({ ...draft, template: e.target.value })}
                    data-testid="commands-template"
                  />
                </Field>
              ) : null}

              <Field label={t("commands.languageLabel")}>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    active={!draft.allLanguages}
                    aria-pressed={!draft.allLanguages}
                    onClick={() => setDraft({ ...draft, allLanguages: false })}
                  >
                    {t("commands.thisLanguage", { lang: recognitionLanguage.toUpperCase() })}
                  </Button>
                  <Button
                    variant="ghost"
                    active={draft.allLanguages}
                    aria-pressed={draft.allLanguages}
                    onClick={() => setDraft({ ...draft, allLanguages: true })}
                  >
                    {t("commands.allLanguages")}
                  </Button>
                </div>
              </Field>

              <div className="flex items-center gap-2">
                <Button
                  tone="accent"
                  disabled={setRules.isPending || phrasesInvalid || templateInvalid}
                  onClick={save}
                  data-testid="commands-save"
                >
                  {t("commands.save")}
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  {t("commands.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button
                variant="ghost"
                onClick={startAdd}
                disabled={setRules.isPending}
                data-testid="commands-add"
              >
                <Plus size={13} strokeWidth={2} />
                {t("commands.add")}
              </Button>
            </div>
          )}

          {setRules.isError ? <Notice tone="danger">{t("commands.saveFailed")}</Notice> : null}
        </div>
      </Panel>

      <Panel label={t("commands.punctuationTitle")}>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              active={dictatePunctuation}
              aria-pressed={dictatePunctuation}
              onClick={() => setPunctuation.mutate(true)}
            >
              {t("settings.background.on")}
            </Button>
            <Button
              variant="ghost"
              active={!dictatePunctuation}
              aria-pressed={!dictatePunctuation}
              onClick={() => setPunctuation.mutate(false)}
            >
              {t("settings.background.off")}
            </Button>
          </div>
          <span className="text-dim text-xs">{t("commands.punctuationHint")}</span>
        </div>
      </Panel>

      <Panel label={t("commands.builtinTitle")} info={<p>{t("commands.builtinHint")}</p>}>
        <div className="flex flex-col gap-1.5">
          {builtins.isError ? <Notice tone="danger">{t("commands.builtinFailed")}</Notice> : null}
          {(builtins.data ?? []).map((cmd, i) => (
            <div
              key={`${cmd.kind}-${i}`}
              className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
            >
              <span className="text-fg font-mono">
                {cmd.phrases.map((p) => `„${p}"`).join(" · ")}
              </span>
              <span className="text-dim">
                {cmd.kind === "punctuation"
                  ? t("commands.effect_punctuation", { char: cmd.inserts })
                  : t(`commands.effect_${cmd.kind}`)}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** One saved rule: what it does, whether it is on, and edit / delete. */
function RuleRow({
  rule,
  onEdit,
  onDelete,
  onToggle,
  disabled,
}: {
  rule: VoiceRuleDto;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const summary =
    rule.action.kind === "insert"
      ? truncate(rule.action.template)
      : t(`commands.action_${rule.action.kind}`);

  return (
    <div
      data-testid="rule-row"
      className="border-line flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border p-2.5"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-fg truncate text-sm">
          {rule.phrases.map((p) => `„${p}"`).join(", ")}
        </span>
        <span className="text-dim truncate text-xs">{summary}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          active={rule.enabled}
          aria-pressed={rule.enabled}
          disabled={disabled}
          onClick={() => onToggle(!rule.enabled)}
        >
          {rule.enabled ? t("settings.background.on") : t("settings.background.off")}
        </Button>
        <IconButton
          label={t("commands.edit")}
          onClick={onEdit}
          disabled={disabled}
          className="h-7 w-7"
        >
          <Pencil size={13} strokeWidth={2} />
        </IconButton>
        <IconButton
          label={t("commands.delete")}
          tone="danger"
          onClick={onDelete}
          disabled={disabled}
          data-testid="rule-delete"
          className="h-7 w-7"
        >
          <Trash2 size={13} strokeWidth={2} />
        </IconButton>
      </div>
    </div>
  );
}

/** A labelled block in the draft form. The controls inside carry their own `aria-label`, so this is a
 * plain grouping element, not a `<label>` (which must wrap a single form control). */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-fg text-sm">{label}</span>
      {hint ? <span className="text-dim text-xs">{hint}</span> : null}
      {children}
    </div>
  );
}

function truncate(s: string): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}
