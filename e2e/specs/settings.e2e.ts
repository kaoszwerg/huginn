import { $, expect } from "@wdio/globals";

/**
 * The settings section rail offers every section. The sections' contents are covered by their own
 * specs (appearance/background/speech/commands); this pins the rail itself.
 */
describe("Settings section rail", () => {
  it("offers every settings section", async () => {
    await $('[data-testid="nav-settings"]').click();
    for (const id of ["recording", "speech", "commands", "appearance", "background"]) {
      await expect($(`[data-testid="section-${id}"]`)).toBeExisting();
    }
  });
});
