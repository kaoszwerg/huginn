import { browser, $, expect } from "@wdio/globals";

/**
 * Appearance settings: theme, interface language and UI size. Each test restores the default it changed,
 * so the run leaves the user's settings as it found them (the settings file is shared across launches).
 */
describe("Appearance settings", () => {
  beforeEach(async () => {
    await $('[data-testid="nav-settings"]').click();
    await $('[data-testid="section-appearance"]').click();
  });

  const htmlTheme = () =>
    browser.execute(() => document.documentElement.getAttribute("data-theme"));

  it("applies the dark and light themes, then follows the system again", async () => {
    await $('[data-testid="theme-dark"]').click();
    await browser.waitUntil(async () => (await htmlTheme()) === "dark", {
      timeoutMsg: "dark theme was not applied to <html>",
    });

    await $('[data-testid="theme-light"]').click();
    await browser.waitUntil(async () => (await htmlTheme()) === "light", {
      timeoutMsg: "light theme was not applied",
    });

    // Back to following the system — the app removes the override entirely.
    await $('[data-testid="theme-system"]').click();
    await browser.waitUntil(async () => (await htmlTheme()) === null, {
      timeoutMsg: "the theme override was not cleared for 'system'",
    });
  });

  it("switches the interface language and back", async () => {
    const recording = $('[data-testid="section-recording"]');

    await $('[data-testid="lang-en"]').click();
    await expect(recording).toHaveText(expect.stringContaining("Recording"));

    await $('[data-testid="lang-de"]').click();
    await expect(recording).toHaveText(expect.stringContaining("Aufnahme"));
  });

  it("changes the UI size and restores it", async () => {
    await $('[data-testid="size-125"]').click();
    await expect($('[data-testid="size-125"]')).toHaveAttribute("aria-pressed", "true");

    await $('[data-testid="size-100"]').click();
    await expect($('[data-testid="size-100"]')).toHaveAttribute("aria-pressed", "true");
  });
});
