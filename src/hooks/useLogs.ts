/**
 * Live log stream for the Logs view: TanStack Query owns the initial ring-buffer load (so loading
 * and error states are surfaced, not swallowed), and records pushed from the backend via the
 * `log://record` Tauri event are appended on top. Pause stops appending (the backend buffer keeps
 * filling); clear empties the local view.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/commands";
import type { LogRecord } from "../bindings/LogRecord";

const MAX = 5000;

export function useLogs() {
  const recent = useQuery({
    queryKey: ["logs", "recent"],
    queryFn: api.getRecentLogs,
    staleTime: Infinity,
  });

  // Records streamed since mount, kept separate from the query snapshot so seeding needs no
  // setState-in-effect. `cleared` hides the snapshot + prior appends when the user clears the view.
  const [appended, setAppended] = useState<LogRecord[]>([]);
  const [cleared, setCleared] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<LogRecord>("log://record", (e) => {
      if (pausedRef.current) return;
      setAppended((prev) => {
        const next = prev.length >= MAX ? prev.slice(prev.length - MAX + 1) : prev.slice();
        next.push(e.payload);
        return next;
      });
    }).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, []);

  const logs = useMemo(() => {
    const base = cleared ? [] : (recent.data ?? []);
    const combined = base.length ? [...base, ...appended] : appended;
    return combined.length > MAX ? combined.slice(combined.length - MAX) : combined;
  }, [recent.data, appended, cleared]);

  return {
    logs,
    isLoading: recent.isLoading,
    error: recent.error,
    clear: () => {
      setCleared(true);
      setAppended([]);
    },
    paused,
    setPaused,
  };
}
