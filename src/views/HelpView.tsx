import { useTranslation } from "react-i18next";
import { Panel } from "../components/ui/Panel";
import { APP_NAME } from "../lib/app";

/**
 * The in-app user guide. Push-to-talk has no obvious surface — the overlay is deliberately quiet and
 * the commands are spoken, not clicked — so the one thing the product cannot do is assume the user
 * already knows how it works. This view is where they find out, without leaving the app.
 */
export function HelpView() {
  const { t } = useTranslation();

  return (
    <div className="h-full space-y-4 overflow-auto p-6">
      <header className="space-y-1">
        <h1 className="text-fg text-lg font-semibold tracking-tight">{t("help.title")}</h1>
        <p className="text-dim max-w-2xl text-sm leading-relaxed">
          {t("help.intro", { name: APP_NAME })}
        </p>
      </header>

      <Panel label={t("help.privacyTitle")}>
        <p className="text-dim text-sm leading-relaxed">{t("help.privacyBody")}</p>
      </Panel>

      <Panel label={t("help.howTitle")}>
        <ol className="text-dim list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
          <li>{t("help.how1")}</li>
          <li>{t("help.how2")}</li>
          <li>{t("help.how3")}</li>
        </ol>
      </Panel>

      <Panel label={t("help.hotkeyTitle")}>
        <p className="text-dim text-sm leading-relaxed">{t("help.hotkeyBody")}</p>
      </Panel>

      <Panel label={t("help.commandsTitle")} info={<p>{t("help.commandsInfo")}</p>}>
        <div className="text-dim space-y-2 text-sm leading-relaxed">
          <p>{t("help.commandsBody")}</p>
          <p>{t("help.macrosBody")}</p>
        </div>
      </Panel>

      <Panel label={t("help.troubleTitle")}>
        <ul className="text-dim space-y-1.5 text-sm leading-relaxed">
          <Item>{t("help.troubleNoModel")}</Item>
          <Item>{t("help.troubleHotkey")}</Item>
          <Item>{t("help.troubleSilent")}</Item>
        </ul>
      </Panel>
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-accent" aria-hidden>
        ·
      </span>
      <span>{children}</span>
    </li>
  );
}
