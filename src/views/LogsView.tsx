import { useMemo, useState } from "react";
import { useLogs } from "../hooks/useLogs";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/TextField";
import { PALETTE } from "../styles/palette";
import type { LogRecord } from "../bindings/LogRecord";

const LEVELS = ["ALL", "ERROR", "WARN", "INFO", "DEBUG"] as const;
type LevelFilter = (typeof LEVELS)[number];

/**
 * A log level is a *state*, so it is drawn in the semantic tokens — not in the accent, which belongs
 * to interaction. The values are `var()` references, so they follow the theme (rule:design-system).
 */
const LEVEL_COLOR: Record<string, string> = {
  ERROR: PALETTE.danger,
  WARN: PALETTE.warning,
  INFO: PALETTE.accent,
  DEBUG: PALETTE.dim,
  TRACE: PALETTE.dim,
};

/** The live log: structured records streamed from the backend, with a level filter, search, sort,
 * pause and clear. It is a developer's window into the app — never a substitute for telling the user
 * something went wrong (that is what `Notice` is for). */
export function LogsView() {
  const { logs, clear, paused, setPaused, error, isLoading } = useLogs();
  const [level, setLevel] = useState<LevelFilter>("ALL");
  const [q, setQ] = useState("");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = logs;
    if (level !== "ALL") out = out.filter((l) => l.level === level);
    if (needle) {
      out = out.filter((l) =>
        `${l.message} ${l.target} ${l.fields}`.toLowerCase().includes(needle),
      );
    }
    out = out.slice();
    if (desc) out.reverse();
    return out;
  }, [logs, level, q, desc]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-fg text-lg font-semibold tracking-tight">Logs</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {LEVELS.map((l) => (
              <Button
                key={l}
                variant="ghost"
                onClick={() => setLevel(l)}
                aria-pressed={level === l}
                active={level === l}
                className="px-2.5 py-1 font-mono"
              >
                {l}
              </Button>
            ))}
          </div>
          <TextField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search…"
            aria-label="Search logs"
            className="w-40"
          />
          <Button variant="ghost" onClick={() => setDesc((d) => !d)} tooltip="Toggle sort order">
            {desc ? "Newest" : "Oldest"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setPaused((p) => !p)}
            active={paused}
            tooltip={paused ? "Resume the live stream" : "Pause the live stream"}
          >
            {paused ? "Paused" : "Live"}
          </Button>
          <Button variant="ghost" tone="danger" onClick={clear}>
            Clear
          </Button>
        </div>
      </header>

      <Panel label={`${rows.length} records`} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-auto font-mono text-xs">
          {error ? (
            <p style={{ color: PALETTE.danger }}>Failed to load logs: {error.message}</p>
          ) : isLoading && logs.length === 0 ? (
            <p className="text-dim">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-dim">No log records.</p>
          ) : (
            rows.map((r, i) => <LogLine key={`${r.ts}-${i}`} rec={r} />)
          )}
        </div>
      </Panel>
    </div>
  );
}

function LogLine({ rec }: { rec: LogRecord }) {
  const color = LEVEL_COLOR[rec.level] ?? PALETTE.dim;
  const time = new Date(rec.ts);
  const ts = Number.isNaN(time.getTime()) ? rec.ts : time.toLocaleTimeString();
  return (
    <div className="border-line flex gap-2 border-b py-1 leading-relaxed">
      <span className="text-dim tabular shrink-0">{ts}</span>
      <span className="w-12 shrink-0 font-semibold" style={{ color }}>
        {rec.level}
      </span>
      <span className="min-w-0 flex-1 break-words">
        <span className="text-fg">{rec.message}</span> <Fields json={rec.fields} />
        {rec.target ? <span className="text-dim ml-2 text-[10px]">({rec.target})</span> : null}
      </span>
    </div>
  );
}

/** The structured fields, rendered inline as key=value. */
function Fields({ json }: { json: string }) {
  if (!json || json === "{}") return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return <span className="text-dim">{json}</span>;
  }
  const entries = Object.entries(obj);
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([k, v]) => (
        <span key={k} className="mr-2 text-[10px]">
          <span className="text-dim">{k}</span>
          <span className="text-dim">=</span>
          <span className="text-fg">{typeof v === "string" ? v : JSON.stringify(v)}</span>
        </span>
      ))}
    </>
  );
}
