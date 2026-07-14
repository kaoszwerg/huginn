import { $, expect } from "@wdio/globals";

/**
 * Every top-level view opens and renders its content, and the Logs view's search box takes input.
 */
describe("Top-level views", () => {
  it("shows the Home view on start", async () => {
    await expect($('[data-testid="view-home"]')).toBeDisplayed();
  });

  it("opens the Help view", async () => {
    await $('[data-testid="nav-help"]').click();
    await expect($('[data-testid="view-help"]')).toBeDisplayed();
  });

  it("opens the Logs view and accepts a search query", async () => {
    await $('[data-testid="nav-logs"]').click();
    await expect($('[data-testid="view-logs"]')).toBeDisplayed();

    const search = $('[data-testid="logs-search"]');
    await search.setValue("startup");
    await expect(search).toHaveValue("startup");
    await search.clearValue();
  });
});
