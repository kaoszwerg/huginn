import { useEffect } from "react";
import { HudPanel } from "./ui/HudPanel";
import { Button } from "./ui/Button";
import { useBuildInfo } from "../hooks/useBuildInfo";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "../lib/app";
// The very icon bundled as the native app/dock/tray icon — one source (ADR-CORE-005).
import logoUrl from "../../src-tauri/icons/icon.svg";

/** HUD-styled "About" dialog (ADR-APP-020/021), opened from the status bar. Shows the app mark, name,
 * tagline and the exact build identity (version + commit, ADR-CORE-024). Closes on the button, Escape,
 * or a backdrop click. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md">
        <HudPanel accent="cyan" label="About">
          <div className="flex flex-col items-center gap-4 text-center">
            <img src={logoUrl} alt="" aria-hidden className="h-20 w-20" />

            <div className="flex flex-col items-center gap-1">
              <h2
                className="text-glow-cyan text-3xl"
                style={{ fontFamily: "Orbitron, sans-serif", letterSpacing: "0.15em" }}
              >
                {APP_NAME}
              </h2>
              <p className="text-green font-mono text-sm tracking-wide">{APP_TAGLINE}</p>
            </div>

            <p className="text-dim text-xs leading-relaxed">{APP_DESCRIPTION}</p>

            <dl className="border-elevated text-dim grid w-full grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-3 text-left font-mono text-xs">
              <Meta k="version" v={build ? `v${build.version}` : "—"} />
              <div className="flex justify-between gap-2">
                <dt>channel</dt>
                <dd className={build?.channel === "dev" ? "text-gold" : "text-fg"}>
                  {build?.channel ?? "—"}
                </dd>
              </div>
              <Meta k="commit" v={build ? `${build.git_sha}${build.git_dirty ? "+" : ""}` : "—"} />
              <Meta k="commit date" v={commitDate} />
            </dl>

            <Button onClick={onClose} className="mt-1 px-4 py-1.5 text-xs tracking-wider uppercase">
              close
            </Button>
          </div>
        </HudPanel>
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
