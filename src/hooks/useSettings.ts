import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";
import type { ThemeChoice } from "../bindings/ThemeChoice";

/** Read the persisted user settings (async/server state owned by TanStack Query, cached 60s). */
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 60_000,
  });
}

/**
 * Mutate user settings; writes the returned state straight into the settings query cache.
 *
 * The hotkey is not settable here — it can be refused by the OS, so it has its own mutation that
 * reports what actually happened (`useSetHotkey`).
 */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { uiScale?: number; minimizeToTray?: boolean; theme?: ThemeChoice }) =>
      api.updateSettings(opts),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}
