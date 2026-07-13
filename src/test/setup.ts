// Vitest global setup: extends `expect` with jest-dom matchers and cleans up after each test.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { i18next } from "../i18n";

/**
 * The tests run the interface in **English**, while the product ships **German** as its first
 * language (ADR-PROJ-010).
 *
 * That is deliberate. The code, the comments and the test names are English, so a test that asserts
 * on English labels reads as one thing; one that asserts on `"Im Infobereich weiterlaufen"` inside an
 * English sentence reads as two. What the tests would *not* catch this way — a missing or broken
 * German string — is not left to chance either: `i18n.test.ts` proves every locale carries every key.
 */
beforeAll(() => {
  void i18next.changeLanguage("en");
});

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
