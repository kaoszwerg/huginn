import { useTranslation } from "react-i18next";
import { Panel } from "../components/ui/Panel";
import { useBuildInfo } from "../hooks/useBuildInfo";
import { APP_DESCRIPTION, APP_NAME } from "../lib/app";

/**
 * The landing view. It states what Huginn is and what the build is — and it proves the IPC round
 * trip works, because the build identity comes from the Rust backend, not from the bundle.
 */
export function HomeView() {
  const { t } = useTranslation();
  const { data: build } = useBuildInfo();

  return (
    <div className="h-full space-y-4 overflow-auto p-6">
      <header className="space-y-1">
        <h1 className="text-fg text-lg font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-dim max-w-2xl text-sm leading-relaxed">{APP_DESCRIPTION}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel label={t("home.worksTitle")}>
          <ul className="text-dim space-y-1.5 text-sm">
            <Item>{t("home.works.pushToTalk")}</Item>
            <Item>{t("home.works.injection")}</Item>
            <Item>{t("home.works.typedIpc")}</Item>
            <Item>{t("home.works.logging")}</Item>
          </ul>
        </Panel>

        <Panel label={t("home.buildTitle")}>
          <dl className="text-dim grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
            <Meta k="version" v={build ? `v${build.version}` : "—"} />
            <Meta k="channel" v={build?.channel ?? "—"} />
            <Meta k="commit" v={build ? `${build.git_sha}${build.git_dirty ? "+" : ""}` : "—"} />
            <Meta k="debug" v={build ? String(build.debug) : "—"} />
          </dl>
        </Panel>
      </div>

      <Panel label={t("home.notYetTitle")} info={<p>{t("home.notYetInfo")}</p>}>
        <p className="text-dim text-sm leading-relaxed">{t("home.notYetBody")}</p>
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

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{k}</dt>
      <dd className="text-fg">{v}</dd>
    </div>
  );
}
