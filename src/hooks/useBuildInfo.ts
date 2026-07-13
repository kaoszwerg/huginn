import { useQuery } from "@tanstack/react-query";
import { api } from "../api/commands";

/** Build identity (version/channel/commit); cached for the process lifetime (never stale). */
export function useBuildInfo() {
  return useQuery({
    queryKey: ["buildInfo"],
    queryFn: api.buildInfo,
    staleTime: Infinity,
  });
}
