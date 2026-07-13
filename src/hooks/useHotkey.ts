import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api/commands";
import type { HotkeyStatus } from "../bindings/HotkeyStatus";

/** The event the backend emits whenever push-to-talk changes state. Pinned on both sides. */
export const HOTKEY_STATUS_EVENT = "hotkey://status";

const KEY = ["hotkey", "status"];

/**
 * Whether push-to-talk is armed.
 *
 * Two sources, one cache: the initial state is fetched, and every later change arrives as a backend
 * event — the hotkey can fail to arm at startup, long before any component asks about it, so polling
 * would show a stale "fine" for as long as the interval lasts.
 */
export function useHotkeyStatus() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: api.getHotkeyStatus,
    // The backend pushes every change; refetching on an interval would only race with it.
    staleTime: Infinity,
  });

  useEffect(() => {
    const unlisten = listen<HotkeyStatus>(HOTKEY_STATUS_EVENT, (e) => {
      qc.setQueryData(KEY, e.payload);
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [qc]);

  return query;
}

/**
 * Change the push-to-talk hotkey.
 *
 * The result is written straight into the status cache — including a *failed* one: if the OS refuses
 * the combination, the UI must keep showing that the key is dead until the user fixes it, not flash
 * a message and forget.
 */
export function useSetHotkey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shortcut: string) => api.setHotkey(shortcut),
    onSuccess: (status) => {
      qc.setQueryData(KEY, status);
      // The shortcut is persisted in settings when it registers, so that cache is stale now.
      void qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
