import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { useBuildInfo } from "./useBuildInfo";
import type { BuildInfo } from "../bindings/BuildInfo";

vi.mock("../api/commands", () => ({
  api: {
    buildInfo: vi.fn(),
  },
}));

import { api } from "../api/commands";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useBuildInfo", () => {
  beforeEach(() => {
    vi.mocked(api.buildInfo).mockReset();
  });

  it("loads the build identity via the buildInfo query", async () => {
    const build: BuildInfo = {
      version: "0.1.0",
      channel: "dev",
      debug: true,
      git_sha: "abc1234",
      git_dirty: false,
      commit_date: "2026-07-11T00:00:00Z",
    };
    vi.mocked(api.buildInfo).mockResolvedValue(build);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBuildInfo(), { wrapper: makeWrapper(qc) });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(build);
    expect(api.buildInfo).toHaveBeenCalledTimes(1);
  });

  it("does not refetch on remount within the process lifetime (staleTime: Infinity)", async () => {
    const build: BuildInfo = {
      version: "0.2.0",
      channel: "release",
      debug: false,
      git_sha: "deadbee",
      git_dirty: false,
      commit_date: "2026-07-10T00:00:00Z",
    };
    vi.mocked(api.buildInfo).mockResolvedValue(build);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const first = renderHook(() => useBuildInfo(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    renderHook(() => useBuildInfo(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(api.buildInfo).toHaveBeenCalledTimes(1));
  });
});
