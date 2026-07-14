import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { useApplyUiScale } from "./useUiScale";
import type { SettingsDto } from "../bindings/SettingsDto";

const { getCurrentWebviewMock } = vi.hoisted(() => ({ getCurrentWebviewMock: vi.fn() }));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: getCurrentWebviewMock,
}));

vi.mock("../api/commands", () => ({
  api: {
    getSettings: vi.fn(),
  },
}));

import { api } from "../api/commands";

function settings(ui_scale: number): SettingsDto {
  return {
    ui_scale,
    minimize_to_tray: false,
    theme: "system",
    language: "en",
    microphone: null,
    model: "ggml-base",
    recognition_language: "de",
    sounds: true,
    hotkey: "Ctrl+Space",
  };
}

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useApplyUiScale", () => {
  beforeEach(() => {
    vi.mocked(api.getSettings).mockReset();
    getCurrentWebviewMock.mockReset();
    document.documentElement.style.removeProperty("zoom");
  });

  it("applies the scale via the native webview zoom and clears a leftover CSS fallback", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings(1.25));
    const setZoom = vi.fn().mockResolvedValue(undefined);
    getCurrentWebviewMock.mockReturnValue({ setZoom });
    document.documentElement.style.setProperty("zoom", "1");

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useApplyUiScale(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(setZoom).toHaveBeenCalledWith(1.25));
    await waitFor(() => expect(document.documentElement.style.getPropertyValue("zoom")).toBe(""));
  });

  it("falls back to CSS zoom when the native setZoom call rejects", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings(0.8));
    const setZoom = vi.fn().mockRejectedValue(new Error("zoom unavailable"));
    getCurrentWebviewMock.mockReturnValue({ setZoom });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useApplyUiScale(), { wrapper: makeWrapper(qc) });

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("zoom")).toBe("0.8"),
    );
  });

  it("falls back to CSS zoom when getCurrentWebview throws synchronously", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(settings(1.5));
    getCurrentWebviewMock.mockImplementation(() => {
      throw new Error("no webview in this environment");
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useApplyUiScale(), { wrapper: makeWrapper(qc) });

    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("zoom")).toBe("1.5"),
    );
  });

  it("defaults to a scale of 1 while settings have not loaded yet", async () => {
    vi.mocked(api.getSettings).mockReturnValue(new Promise(() => {}));
    const setZoom = vi.fn().mockResolvedValue(undefined);
    getCurrentWebviewMock.mockReturnValue({ setZoom });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useApplyUiScale(), { wrapper: makeWrapper(qc) });

    await waitFor(() => expect(setZoom).toHaveBeenCalledWith(1));
  });
});
