import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { useSettings, useUpdateSettings } from "./useSettings";
import type { SettingsDto } from "../bindings/SettingsDto";

vi.mock("../api/commands", () => ({
  api: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
  },
}));

import { api } from "../api/commands";

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useSettings", () => {
  beforeEach(() => {
    vi.mocked(api.getSettings).mockReset();
    vi.mocked(api.updateSettings).mockReset();
  });

  it("loads the persisted settings via the settings query", async () => {
    const settings: SettingsDto = {
      ui_scale: 1.1,
      minimize_to_tray: false,
      theme: "system",
      hotkey: "Ctrl+Space",
    };
    vi.mocked(api.getSettings).mockResolvedValue(settings);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper(qc) });

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(settings);
    expect(api.getSettings).toHaveBeenCalledTimes(1);
  });

  it("surfaces a rejected settings query as an error", async () => {
    vi.mocked(api.getSettings).mockRejectedValue(new Error("io failure"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useSettings(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("io failure");
  });
});

describe("useUpdateSettings", () => {
  beforeEach(() => {
    vi.mocked(api.getSettings).mockReset();
    vi.mocked(api.updateSettings).mockReset();
  });

  it("calls api.updateSettings with the given options and writes the result into the settings cache", async () => {
    const updated: SettingsDto = {
      ui_scale: 1.25,
      minimize_to_tray: false,
      theme: "system",
      hotkey: "Ctrl+Space",
    };
    vi.mocked(api.updateSettings).mockResolvedValue(updated);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useUpdateSettings(), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ uiScale: 1.25 });
    });

    expect(api.updateSettings).toHaveBeenCalledWith({ uiScale: 1.25 });
    expect(qc.getQueryData(["settings"])).toEqual(updated);
  });
});
