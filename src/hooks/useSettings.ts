import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";

/** Read the persisted user settings (async/server state owned by TanStack Query, cached 60s). */
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: 60_000,
  });
}

/** Mutate user settings; writes the returned state straight into the settings query cache. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { uiScale?: number; minimizeToTray?: boolean }) => api.updateSettings(opts),
    onSuccess: (data) => qc.setQueryData(["settings"], data),
  });
}
