import { browser, $, $$, expect } from "@wdio/globals";

/**
 * Speech settings: the model catalogue, the microphone choice, the start/stop sound, and the in-app
 * file picker that imports a model.
 *
 * Deliberately NOT covered here, and why (these are the real, blocked gaps):
 * - **Downloading a model** starts a real ~150 MB network fetch. It needs a mock server with a known
 *   checksum to be deterministic; driving it for real would make the suite slow and flaky. The download
 *   logic is unit-tested in `huginn-models`.
 * - **Dropping a file** onto the drop zone is a native OS drag-and-drop, which WebDriver cannot
 *   synthesise into the webview. The drop zone's filtering and hit-testing are unit-tested
 *   (`FileDropZone.test.tsx`); the copy/verify path is unit-tested in `huginn-models`.
 * - **Actually importing a picked file** would need a real model file on the test machine; the picker's
 *   navigation and selection are unit-tested (`FilePicker.test.tsx`). The E2E here drives the picker
 *   open and closed — that part is entirely in-webview now, because the OS file dialog is gone
 *   (rule:design-system, ADR-APP-026).
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

  it("offers the system-default microphone and the browse button", async () => {
    await expect($('[data-testid="mic-default"]')).toBeDisplayed();
    await expect($('[data-testid="model-import"]')).toBeDisplayed();
  });

  it("opens the in-app file picker (not a native dialog) and cancels it", async () => {
    // No native OS dialog: the browse button opens a design-system modal WebDriver can see and drive.
    await $('[data-testid="model-import"]').click();
    await expect($('[data-testid="filepicker"]')).toBeDisplayed();

    // It shows where it is and the ways to move, and refuses to confirm until a file is chosen.
    await expect($('[data-testid="filepicker-path"]')).toBeDisplayed();
    await expect($('[data-testid="filepicker-home"]')).toBeDisplayed();
    await expect($('[data-testid="filepicker-select"]')).toBeDisabled();

    await $('[data-testid="filepicker-cancel"]').click();
    await expect($('[data-testid="filepicker"]')).not.toBeDisplayed();
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
