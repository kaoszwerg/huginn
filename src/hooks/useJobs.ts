import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";

/**
 * Everything slow the backend is doing (ADR-PROJ-008).
 *
 * **Polled, not pushed — for now, and deliberately.** ADR-PROJ-008 calls for coalesced events, and
 * that is the right end state: a 3 GB download must not emit an event per chunk. Polling once a second
 * while *something is running* is the honest interim: it is one IPC call, it stops entirely when the
 * list is empty, and it cannot flood anything. The event stream replaces it without changing this
 * hook's shape.
 */
export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: api.listJobs,
    // Poll while there is work; stop when there is none.
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const running = jobs.some((j) => j.state === "running" || j.state === "queued");
      return running ? 500 : false;
    },
    staleTime: 0,
  });
}

/** Stop a job. The work actually stops — the row is not merely hidden (rule:jobs). */
export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.cancelJob(id),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}
