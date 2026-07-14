import { useQuery } from "@tanstack/react-query";
import { api } from "../api/commands";

/**
 * List a directory for the in-app file picker (ADR-PROJ-006, rule:design-system).
 *
 * `path` is `null` for the user's home directory — the picker's starting point, resolved by the
 * backend so the frontend never hardcodes a platform path (rule:cross-platform).
 *
 * Deliberately **not** keeping the previous listing on screen while the next loads: a folder the user
 * cannot read must surface *its own* error, not silently leave the last folder's contents visible as
 * if the navigation had done nothing (rule:logging — no silent failures). A local directory listing
 * is fast enough that the brief loading state is the honest trade.
 */
export function useDirectory(path: string | null) {
  return useQuery({
    queryKey: ["directory", path],
    queryFn: () => api.listDirectory(path ?? undefined),
    staleTime: 5_000,
  });
}
