import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { useHotkeyStatus, useSetHotkey, HOTKEY_STATUS_EVENT } from "./useHotkey";
import type { HotkeyStatus } from "../bindings/HotkeyStatus";

// A Map, not an object: an object keyed by a variable is a prototype-pollution sink, and the lint
// rule that says so (security/detect-object-injection) is right even in a test.
const listeners = new Map<string, (e: { payload: HotkeyStatus }) => void>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, cb: (e: { payload: HotkeyStatus }) => void) => {
    listeners.set(event, cb);
    return Promise.resolve(() => listeners.delete(event));
  }),
}));

vi.mock("../api/commands", () => ({
  api: {
    getHotkeyStatus: vi.fn(),
    setHotkey: vi.fn(),
  },
}));

import { api } from "../api/commands";
import { listen } from "@tauri-apps/api/event";

const ARMED: HotkeyStatus = { shortcut: "Ctrl+Space", registered: true, error: null };
const DEAD: HotkeyStatus = {
  shortcut: "Ctrl+Space",
  registered: false,
  error: "already used by another application",
};

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useHotkeyStatus", () => {
  beforeEach(() => {
    vi.mocked(api.getHotkeyStatus).mockResolvedValue(ARMED);
  });

  it("subscribes to the exact event name the backend emits", async () => {
    // The boundary contract: Rust emits `spike::HOTKEY_STATUS_EVENT`. If either side renames it, the
    // UI would silently never learn that the hotkey died (rule:testing — pinned on both sides).
    expect(HOTKEY_STATUS_EVENT).toBe("hotkey://status");

    renderHook(() => useHotkeyStatus(), { wrapper });
    await waitFor(() =>
      expect(listen).toHaveBeenCalledWith(HOTKEY_STATUS_EVENT, expect.any(Function)),
    );
  });

  it("reads the initial status from the backend", async () => {
    const { result } = renderHook(() => useHotkeyStatus(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(ARMED));
  });

  it("updates when the backend says the hotkey died", async () => {
    // The hotkey can fail to arm long before any component asks about it, and it can be lost while
    // the app runs. The push is what keeps the window honest.
    const { result } = renderHook(() => useHotkeyStatus(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(ARMED));

    const emit = listeners.get(HOTKEY_STATUS_EVENT);
    expect(emit).toBeDefined();
    act(() => emit?.({ payload: DEAD }));

    await waitFor(() => expect(result.current.data).toEqual(DEAD));
  });
});

describe("useSetHotkey", () => {
  it("keeps showing the failure when the OS refuses the combination", async () => {
    // A refused shortcut resolves (it is a state, not an exception) and must land in the cache, so
    // the notice stays on screen until the user actually fixes it.
    vi.mocked(api.getHotkeyStatus).mockResolvedValue(ARMED);
    vi.mocked(api.setHotkey).mockResolvedValue(DEAD);

    const { result } = renderHook(() => ({ status: useHotkeyStatus(), set: useSetHotkey() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.status.data).toEqual(ARMED));

    act(() => result.current.set.mutate("Ctrl+Space"));

    await waitFor(() => expect(result.current.status.data).toEqual(DEAD));
  });
});
