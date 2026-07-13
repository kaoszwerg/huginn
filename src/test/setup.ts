// Vitest global setup: extends `expect` with jest-dom matchers and cleans up after each test.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom doesn't ship ResizeObserver. Any component that observes element size would crash without
// a stub. The bodies stay empty — jsdom has no real layout to observe and no test asserts on
// resize semantics.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {
      /* no-op */
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
  }
  // Cast: the test stub doesn't implement the full ResizeObserver type (callback, options),
  // and we don't need it to — nothing under test reads those.
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
