import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Speech settings: the model catalogue, the microphone choice, and the start/stop sound.
 *
 * Deliberately NOT covered here, and why (these are the real, blocked gaps):
 * - **Downloading a model** starts a real ~150 MB network fetch. It needs a mock server with a known
 *   checksum to be deterministic; driving it for real would make the suite slow and flaky. The download
 *   logic is unit-tested in `huginn-models`.
 * - **Importing a model** opens a native OS file picker, which lives outside the webview — WebDriver
 *   cannot click it. Cover the copy/verify path by calling the `import_model` command directly.
 */
describe("Speech settings", () => {
  beforeEach(async () => {
    await $('[data-testid="nav-settings"]').click();
    await $('[data-testid="section-speech"]').click();
  });

  it("lists the model catalogue", async () => {
    await browser.waitUntil(async () => (await $$('[data-testid="model-row"]')).length > 0, {
      timeoutMsg: "no models were listed",
    });
  });

  it("offers the system-default microphone and the import button", async () => {
    await expect($('[data-testid="mic-default"]')).toBeDisplayed();
    // The import control exists even though its file picker is out of WebDriver's reach.
    await expect($('[data-testid="model-import"]')).toBeDisplayed();
  });

  it("toggles the start/stop sound and restores it", async () => {
    const soundsWereOn =
      (await $('[data-testid="sounds-on"]').getAttribute("aria-pressed")) === "true";

    const target = soundsWereOn ? "sounds-off" : "sounds-on";
    await $(`[data-testid="${target}"]`).click();
    await expect($(`[data-testid="${target}"]`)).toHaveAttribute("aria-pressed", "true");

    // Restore.
    await $(`[data-testid="${soundsWereOn ? "sounds-on" : "sounds-off"}"]`).click();
  });
});
