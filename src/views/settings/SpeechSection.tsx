import { Check, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Panel } from "../../components/ui/Panel";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { useSettings } from "../../hooks/useSettings";
import {
  useDownloadModel,
  useMicrophones,
  useModels,
  useSetMicrophone,
  useSetModel,
  useSetSounds,
} from "../../hooks/useSpeech";

/**
 * Everything about recognising speech: which microphone, which model, and whether Huginn makes a
 * sound when it starts and stops listening.
 *
 * The model panel is where the product's one network connection lives (ADR-PROJ-006). It says so, in
 * the interface, before the click — a user should never learn from a firewall dialog that an app they
 * believed to be offline is talking to a server.
 */
export function SpeechSection() {
  const { t } = useTranslation();
  const settings = useSettings();

  const microphones = useMicrophones();
  const setMicrophone = useSetMicrophone();

  const models = useModels();
  const download = useDownloadModel();
  const setModel = useSetModel();
  const setSounds = useSetSounds();

  const chosenMic = settings.data?.microphone ?? null;
  const chosenModel = settings.data?.model ?? "ggml-base";
  const sounds = settings.data?.sounds ?? true;

  const anyInstalled = (models.data ?? []).some((m) => m.installed);

  return (
    <div className="space-y-4">
      <Panel label={t("speech.modelTitle")} info={<p>{t("speech.modelInfo")}</p>}>
        <div className="flex flex-col gap-3">
          {/* The state a fresh install is in. It is not an error — but the product cannot work until
              it is resolved, so it is said plainly and with the way out attached. */}
          {!anyInstalled && !models.isLoading ? (
            <Notice tone="warning">{t("speech.noModel")}</Notice>
          ) : null}

          {models.data?.map((model) => (
            <div
              key={model.id}
              className="border-line flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-fg flex items-center gap-2 text-sm">
                  {model.label}
                  {model.installed && chosenModel === model.id ? (
                    <Check size={14} className="text-success" aria-label={t("speech.inUse")} />
                  ) : null}
                </span>
                <span className="text-dim text-xs">{model.note}</span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-dim tabular font-mono text-xs">{model.size_mb} MB</span>

                {model.installed ? (
                  <Button
                    variant="ghost"
                    active={chosenModel === model.id}
                    aria-pressed={chosenModel === model.id}
                    disabled={setModel.isPending}
                    onClick={() => setModel.mutate(model.id)}
                  >
                    {chosenModel === model.id ? t("speech.inUse") : t("speech.use")}
                  </Button>
                ) : (
                  <Button
                    tone="accent"
                    disabled={download.isPending}
                    onClick={() => download.mutate(model.id)}
                  >
                    <Download size={13} strokeWidth={2} />
                    {t("speech.download")}
                  </Button>
                )}
              </div>
            </div>
          ))}

          {download.isError ? (
            <Notice tone="danger">
              {t("speech.downloadFailed")}{" "}
              {download.error instanceof Error ? download.error.message : ""}
            </Notice>
          ) : null}

          {/* Said before the click, not in a privacy policy (ADR-PROJ-006). */}
          <p className="text-dim text-xs leading-relaxed">{t("speech.networkNote")}</p>
        </div>
      </Panel>

      <Panel label={t("speech.microphoneTitle")}>
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            className="justify-start"
            active={chosenMic === null}
            aria-pressed={chosenMic === null}
            onClick={() => setMicrophone.mutate(null)}
          >
            {t("speech.systemDefault")}
          </Button>

          {microphones.data?.map((mic) => (
            <Button
              key={mic.name}
              variant="ghost"
              className="justify-start"
              active={chosenMic === mic.name}
              aria-pressed={chosenMic === mic.name}
              onClick={() => setMicrophone.mutate(mic.name)}
            >
              {mic.name}
              {mic.is_default ? (
                <span className="text-dim ml-1 text-xs">({t("speech.isDefault")})</span>
              ) : null}
            </Button>
          ))}

          {microphones.isError ? (
            <Notice tone="danger">{t("speech.microphonesFailed")}</Notice>
          ) : null}

          <span className="text-dim text-xs">{t("speech.microphoneHint")}</span>
        </div>
      </Panel>

      <Panel label={t("speech.soundsTitle")}>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              active={sounds}
              aria-pressed={sounds}
              onClick={() => setSounds.mutate(true)}
            >
              {t("settings.background.on")}
            </Button>
            <Button
              variant="ghost"
              active={!sounds}
              aria-pressed={!sounds}
              onClick={() => setSounds.mutate(false)}
            >
              {t("settings.background.off")}
            </Button>
          </div>
          <span className="text-dim text-xs">{t("speech.soundsHint")}</span>
        </div>
      </Panel>
    </div>
  );
}
