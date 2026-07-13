import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { ReactNode } from "react";
import { useLogs } from "./useLogs";
import type { LogRecord } from "../bindings/LogRecord";

vi.mock("../api/commands", () => ({
  api: {
    getRecentLogs: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { api } from "../api/commands";
import { listen } from "@tauri-apps/api/event";

const mockListen = listen as unknown as Mock;

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function rec(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    ts: "2026-07-11T00:00:00Z",
    level: "INFO",
    target: "app",
    message: "hello",
    fields: "{}",
    ...overrides,
  };
}

describe("useLogs", () => {
  let handler: ((e: { event: string; id: number; payload: LogRecord }) => void) | undefined;

  beforeEach(() => {
    handler = undefined;
    vi.mocked(api.getRecentLogs).mockReset();
    mockListen.mockReset();
    mockListen.mockImplementation(
      (_event: string, cb: (e: { event: string; id: number; payload: LogRecord }) => void) => {
        handler = cb;
        return Promise.resolve(() => undefined);
      },
    );
  });

  it("loads the initial ring-buffer snapshot via the recent-logs query", async () => {
    const snapshot = [rec({ message: "boot" })];
    vi.mocked(api.getRecentLogs).mockResolvedValue(snapshot);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useLogs(), { wrapper: makeWrapper(qc) });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.logs).toEqual(snapshot);
    expect(result.current.error).toBeNull();
  });

  it("appends a streamed log://record event on top of the snapshot", async () => {
    vi.mocked(api.getRecentLogs).mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useLogs(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(listen).toHaveBeenCalledWith("log://record", expect.any(Function)));
    await waitFor(() => expect(handler).toBeDefined());

    const streamed = rec({ message: "live event" });
    act(() => handler?.({ event: "log://record", id: 1, payload: streamed }));

    await waitFor(() => expect(result.current.logs).toContainEqual(streamed));
  });

  it("does not append streamed records while paused", async () => {
    vi.mocked(api.getRecentLogs).mockResolvedValue([]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useLogs(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(handler).toBeDefined());

    act(() => result.current.setPaused(true));
    expect(result.current.paused).toBe(true);

    act(() => handler?.({ event: "log://record", id: 2, payload: rec({ message: "dropped" }) }));

    expect(result.current.logs).toEqual([]);
  });

  it("clear empties both the snapshot and any appended records", async () => {
    const snapshot = [rec({ message: "boot" })];
    vi.mocked(api.getRecentLogs).mockResolvedValue(snapshot);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useLogs(), { wrapper: makeWrapper(qc) });
    await waitFor(() => expect(result.current.logs).toEqual(snapshot));
    await waitFor(() => expect(handler).toBeDefined());

    act(() => handler?.({ event: "log://record", id: 3, payload: rec({ message: "appended" }) }));
    await waitFor(() => expect(result.current.logs.length).toBe(2));

    act(() => result.current.clear());
    expect(result.current.logs).toEqual([]);
  });
});
