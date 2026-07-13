import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "./ui/Panel";
import { Button } from "./ui/Button";
import { useBuildInfo } from "../hooks/useBuildInfo";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "../lib/app";
// The very icon bundled as the native app/dock/tray icon — one source (ADR-CORE-005).
import logoUrl from "../../src-tauri/icons/icon.svg";

/**
 * The About dialog (ADR-PROJ-003), opened from the status bar: the mark, the name, and the exact
 * build identity — version *and* commit, because the version alone does not say what is running
 * (ADR-CORE-024). Closes on the button, on Escape, or on a backdrop click.
 */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { data: build } = useBuildInfo();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commit = build?.commit_date ? new Date(build.commit_date) : null;
  const commitDate = commit && !Number.isNaN(commit.getTime()) ? commit.toLocaleDateString() : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm" style={{ boxShadow: "var(--huginn-shadow)" }}>
        <Panel label={t("about.title")}>
          <div className="flex flex-col items-center gap-4 text-center">
            <img src={logoUrl} alt="" aria-hidden className="h-16 w-16" />

            <div className="flex flex-col items-center gap-1">
              <h2 className="text-fg text-2xl font-semibold tracking-tight">{APP_NAME}</h2>
              <p className="text-dim text-sm">{APP_TAGLINE}</p>
            </div>

            <p className="text-dim text-xs leading-relaxed">{APP_DESCRIPTION}</p>

            <dl className="border-line text-dim grid w-full grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-left font-mono text-xs">
              <Meta k={t("about.version")} v={build ? `v${build.version}` : "—"} />
              <div className="flex justify-between gap-2">
                <dt>{t("about.channel")}</dt>
                <dd className={build?.channel === "dev" ? "text-warning" : "text-fg"}>
                  {build?.channel ?? "—"}
                </dd>
              </div>
              <Meta
                k={t("about.commit")}
                v={build ? `${build.git_sha}${build.git_dirty ? "+" : ""}` : "—"}
              />
              <Meta k={t("about.commitDate")} v={commitDate} />
            </dl>

            <Button onClick={onClose} className="mt-1">
              {t("about.close")}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
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
