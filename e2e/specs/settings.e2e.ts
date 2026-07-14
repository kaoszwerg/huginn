import { $, expect } from "@wdio/globals";

/**
 * The app opens and its settings are reachable and navigable. Selectors are stable `data-testid`s, so
 * these do not break when the interface language or the copy changes.
 */
describe("Settings navigation", () => {
  it("opens the app with the primary navigation present", async () => {
    await expect($('[data-testid="nav-home"]')).toBeExisting();
    await expect($('[data-testid="nav-settings"]')).toBeExisting();
  });

  it("opens Settings and reaches the Commands section", async () => {
    await $('[data-testid="nav-settings"]').click();

    const commands = $('[data-testid="section-commands"]');
    await expect(commands).toBeExisting();
    await commands.click();

    // The Commands section renders its "add command" control.
    await expect($('[data-testid="commands-add"]')).toBeDisplayed();
  });
});
