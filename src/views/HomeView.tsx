import { Panel } from "../components/ui/Panel";
import { useBuildInfo } from "../hooks/useBuildInfo";
import { APP_DESCRIPTION, APP_NAME } from "../lib/app";

/**
 * The landing view. It states what Huginn is and what the build is — and it proves the IPC round
 * trip works, because the build identity comes from the Rust backend, not from the bundle.
 */
export function HomeView() {
  const { data: build } = useBuildInfo();

  return (
    <div className="h-full space-y-4 overflow-auto p-6">
      <header className="space-y-1">
        <h1 className="text-fg text-lg font-semibold tracking-tight">{APP_NAME}</h1>
        <p className="text-dim max-w-2xl text-sm leading-relaxed">{APP_DESCRIPTION}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel label="What works">
          <ul className="text-dim space-y-1.5 text-sm">
            <Item>Push-to-talk hotkey with a focus-neutral recording overlay</Item>
            <Item>Text inserted straight into the application you were working in</Item>
            <Item>Typed IPC surface (ts-rs bindings as the single source of truth)</Item>
            <Item>Structured logging: console, rotating JSON file, live log view</Item>
          </ul>
        </Panel>

        <Panel label="Build">
          <dl className="text-dim grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
            <Meta k="version" v={build ? `v${build.version}` : "—"} />
            <Meta k="channel" v={build?.channel ?? "—"} />
            <Meta k="commit" v={build ? `${build.git_sha}${build.git_dirty ? "+" : ""}` : "—"} />
            <Meta k="debug" v={build ? String(build.debug) : "—"} />
          </dl>
        </Panel>
      </div>

      <Panel
        label="Not yet"
        info={
          <p>
            Speech recognition runs in a separate, deprivileged worker process — the process that
            holds the microphone and synthesises keystrokes must never be the one parsing a model
            file (ADR-PROJ-005).
          </p>
        }
      >
        <p className="text-dim text-sm leading-relaxed">
          There is no speech engine yet: holding the hotkey shows the overlay and inserts a probe
          string, which is what proves the path from key to text end to end. The recogniser, the
          model catalogue and the dictionary follow.
        </p>
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
