import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";

const KEY = ["autostart"];

/**
 * Whether Huginn starts with the desktop.
 *
 * Read from the **operating system**, never from our settings file. The user can remove the entry
 * themselves — Task Manager on Windows, System Settings on macOS — and a cached copy would leave the
 * app showing a switch that is a lie.
 */
export function useAutostart() {
  return useQuery({
    queryKey: KEY,
    queryFn: api.getAutostart,
    // It can change behind our back, so do not cache it for long.
    staleTime: 5_000,
  });
}

/** Turn autostart on or off. The result written into the cache is what the OS *reports*, not what we
 * asked for — if the system refused, the switch must snap back rather than lie. */
export function useSetAutostart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.setAutostart(enabled),
    onSuccess: (actual) => qc.setQueryData(KEY, actual),
  });
}
