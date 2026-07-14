import { browser, $, $$, expect } from "@wdio/globals";

/**
 * The voice-command editor, driven end to end: add a macro, see it appear in the list, then remove it.
 * The cleanup matters — an E2E must not leave test data in the user's settings — and it also exercises
 * the delete path, so the one test covers create, list and delete.
 *
 * Run against a disposable profile (see `e2e/README.md`): this writes to the app's real settings file.
 */
describe("Voice commands editor", () => {
  const PHRASE = "e2e-testbefehl";

  it("adds a macro, shows it in the list, then removes it", async () => {
    await $('[data-testid="nav-settings"]').click();
    await $('[data-testid="section-commands"]').click();

    const before = (await $$('[data-testid="rule-row"]')).length;

    await $('[data-testid="commands-add"]').click();
    await $('[data-testid="commands-phrases"]').setValue(PHRASE);
    await $('[data-testid="commands-template"]').setValue("Mit freundlichen Grüßen");
    await $('[data-testid="commands-save"]').click();

    await browser.waitUntil(async () => (await $$('[data-testid="rule-row"]')).length > before, {
      timeout: 10_000,
      timeoutMsg: "the new voice command did not appear in the list",
    });

    // Clean up: delete the row we just added, matched by its phrase.
    for (const row of await $$('[data-testid="rule-row"]')) {
      if ((await row.getText()).includes(PHRASE)) {
        await row.$('[data-testid="rule-delete"]').click();
        break;
      }
    }

    await browser.waitUntil(async () => (await $$('[data-testid="rule-row"]')).length === before, {
      timeout: 10_000,
      timeoutMsg: "the test voice command was not removed",
    });
  });
});
