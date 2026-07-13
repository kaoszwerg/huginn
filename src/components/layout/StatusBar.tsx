import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { useBuildInfo } from "../../hooks/useBuildInfo";
import { useUiStore } from "../../store/ui";
import { APP_NAME } from "../../lib/app";

/** The bottom strip: which build is running (click for the About dialog) and the scroll-to-top action. */
export function StatusBar({
  canScrollTop = false,
  onScrollTop,
}: {
  canScrollTop?: boolean;
  onScrollTop?: () => void;
}) {
  const { t } = useTranslation();
  const { data: build } = useBuildInfo();
  const setAboutOpen = useUiStore((s) => s.setAboutOpen);

  return (
    <footer className="bg-surface border-line text-dim flex h-7 shrink-0 items-center justify-between border-t px-2 text-[11px]">
      <Button
        variant="ghost"
        onClick={() => setAboutOpen(true)}
        tooltip={t("window.about", { name: APP_NAME })}
        className="px-2 py-0.5 font-mono"
      >
        {APP_NAME} {build ? `v${build.version}` : ""}
        {build ? (
          <span className="text-dim ml-1">
            ({build.git_sha}
            {build.git_dirty ? "+" : ""})
          </span>
        ) : null}
        {build?.channel === "dev" ? <span className="text-warning ml-1">· dev</span> : null}
      </Button>

      {canScrollTop ? (
        <Button
          variant="ghost"
          onClick={onScrollTop}
          aria-label={t("window.scrollTop")}
          tooltip={t("window.scrollTop")}
          className="px-2 py-0.5"
        >
          ↑
        </Button>
      ) : null}
    </footer>
  );
}
