import { HudPanel } from "../components/ui/HudPanel";
import { useBuildInfo } from "../hooks/useBuildInfo";
import { APP_DESCRIPTION, APP_NAME } from "../lib/app";

/** Landing view of the empty shell. It shows what the shell already provides, so the first product
 * feature has an obvious place to land — and it proves the IPC round-trip works (build info comes
 * from the Rust backend). */
export function HomeView() {
  const { data: build } = useBuildInfo();

  return (
    <div className="h-full space-y-4 overflow-auto p-6">
      <header className="space-y-1">
        <h1
          className="hud-label text-glow-cyan"
          style={{ "--hud-label-size": "1.1rem" } as React.CSSProperties}
        >
          {APP_NAME}
        </h1>
        <p className="text-dim max-w-2xl text-sm leading-relaxed">{APP_DESCRIPTION}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <HudPanel accent="cyan" label="Shell">
          <ul className="text-dim space-y-1.5 text-sm">
            <Item>Frameless HUD window with custom chrome and tray integration</Item>
            <Item>Typed IPC surface (ts-rs bindings as the single source of truth)</Item>
            <Item>Structured logging: console, rotating JSON file, live log view</Item>
            <Item>Persisted settings and window geometry</Item>
          </ul>
        </HudPanel>

        <HudPanel accent="green" label="Build">
          <dl className="text-dim grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
            <Meta k="version" v={build ? `v${build.version}` : "—"} />
            <Meta k="channel" v={build?.channel ?? "—"} />
            <Meta k="commit" v={build ? `${build.git_sha}${build.git_dirty ? "+" : ""}` : "—"} />
            <Meta k="debug" v={build ? String(build.debug) : "—"} />
          </dl>
        </HudPanel>
      </div>

      <HudPanel
        accent="purple"
        label="Next"
        info={
          <p>
            The shell carries no domain logic on purpose. Product features are added as their own
            modules: a Rust module plus commands in the backend, a view plus hooks in the frontend.
          </p>
        }
      >
        <p className="text-dim text-sm leading-relaxed">
          No product features yet. Add a backend module under <code>src-tauri/src/</code>, expose it
          through <code>commands/</code>, and give it a view under <code>src/views/</code> plus an
          entry in the sidebar.
        </p>
      </HudPanel>
    </div>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-cyan">›</span>
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
