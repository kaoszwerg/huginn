import { $, expect } from "@wdio/globals";

/**
 * Background settings: close-to-tray and autostart. Both restore what they change — autostart in a
 * `finally`, because it writes the OS (the Windows Run registry key) and must never be left flipped.
 */
describe("Background settings", () => {
  beforeEach(async () => {
    await $('[data-testid="nav-settings"]').click();
    await $('[data-testid="section-background"]').click();
  });

  it("toggles close-to-tray and restores keeping it running", async () => {
    await $('[data-testid="tray-close"]').click();
    await expect($('[data-testid="tray-close"]')).toHaveAttribute("aria-pressed", "true");

    // Restore the default: keep running in the tray (the hotkey is the product).
    await $('[data-testid="tray-keep"]').click();
    await expect($('[data-testid="tray-keep"]')).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles autostart and restores the original OS state", async () => {
    const isOn = async () =>
      (await $('[data-testid="autostart-on"]').getAttribute("aria-pressed")) === "true";

    const originalOn = await isOn();
    try {
      const target = originalOn ? "autostart-off" : "autostart-on";
      await $(`[data-testid="${target}"]`).click();
      await expect($(`[data-testid="${target}"]`)).toHaveAttribute("aria-pressed", "true");
    } finally {
      // Put the OS back exactly as it was, whatever happened above.
      await $(`[data-testid="${originalOn ? "autostart-on" : "autostart-off"}"]`).click();
    }
    await expect(await isOn()).toBe(originalOn);
  });
});
