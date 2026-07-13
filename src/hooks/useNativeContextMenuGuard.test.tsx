import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useNativeContextMenuGuard } from "./useNativeContextMenuGuard";

/** Fire a cancelable contextmenu event and report whether a listener suppressed it. */
function rightClick(): boolean {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("useNativeContextMenuGuard", () => {
  it("suppresses the native context menu in a release build", () => {
    vi.stubEnv("DEV", false);
    renderHook(() => useNativeContextMenuGuard());
    expect(rightClick()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("also suppresses it in a dev build (Inspect stays on F12/Ctrl+Shift+I, not right-click)", () => {
    vi.stubEnv("DEV", true);
    renderHook(() => useNativeContextMenuGuard());
    expect(rightClick()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("removes the listener on unmount", () => {
    const { unmount } = renderHook(() => useNativeContextMenuGuard());
    unmount();
    expect(rightClick()).toBe(false);
  });
});
