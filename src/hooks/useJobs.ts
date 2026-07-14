import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/commands";
import type { Job } from "../bindings/Job";

/**
 * Mutations that create a backend Job (a model download, a model import) tag themselves with this key.
 * The job poll watches for it, so it runs for the **whole** operation — from before the job even exists
 * until it is gone — which is what makes a brand-new download show up in the monitor at all.
 */
export const MODEL_OP_MUTATION_KEY = ["model-op"] as const;

/**
 * How often to re-read the job list, or `false` to stop. Pure, so the rule is testable.
 *
 * Poll while a job is running **or** a job-creating operation is in flight. That second clause is the
 * fix for the bug where a download showed no progress and no monitor row: polling used to start only
 * once a job was already visible, but a fresh download is invisible until its first poll — a chicken and
 * egg the running-only check could never break. While the download mutation is pending, we poll, so the
 * job is caught the instant the backend registers it.
 */
export function jobsRefetchInterval(jobs: Job[], activeModelOps: number): number | false {
  const running = jobs.some((j) => j.state === "running" || j.state === "queued");
  return running || activeModelOps > 0 ? 500 : false;
}

/**
 * Everything slow the backend is doing (ADR-PROJ-008).
 *
 * **Polled, not pushed — for now, and deliberately.** ADR-PROJ-008 calls for coalesced events, and
 * that is the right end state: a 3 GB download must not emit an event per chunk. Polling twice a second
 * while *something is happening* is the honest interim: it is one IPC call, it stops entirely when there
 * is nothing to watch, and it cannot flood anything. The event stream replaces it without changing this
 * hook's shape.
 */
export function useJobs() {
  const activeModelOps = useIsMutating({ mutationKey: MODEL_OP_MUTATION_KEY });
  return useQuery({
    queryKey: ["jobs"],
    queryFn: api.listJobs,
    refetchInterval: (query) => jobsRefetchInterval(query.state.data ?? [], activeModelOps),
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
