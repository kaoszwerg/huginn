import { browser, $, $$, expect } from "@wdio/globals";

/**
 * The voice-command editor, driven end to end: the built-in reference, the punctuation toggle, and the
 * full add / edit / delete lifecycle for user rules. Every test cleans up after itself — an E2E must not
 * leave test data in the user's settings. Run against a disposable profile (see `e2e/README.md`).
 */
describe("Voice commands", () => {
  beforeEach(async () => {
    await $('[data-testid="nav-settings"]').click();
    await $('[data-testid="section-commands"]').click();
  });

  it("shows the built-in command reference", async () => {
    await browser.waitUntil(async () => (await $$('[data-testid="builtin-row"]')).length > 0, {
      timeoutMsg: "the built-in command reference was empty",
    });
  });

  it("toggles spoken punctuation and restores it off", async () => {
    await $('[data-testid="punctuation-on"]').click();
    await expect($('[data-testid="punctuation-on"]')).toHaveAttribute("aria-pressed", "true");
    await $('[data-testid="punctuation-off"]').click();
    await expect($('[data-testid="punctuation-off"]')).toHaveAttribute("aria-pressed", "true");
  });

  it("adds a macro, shows it in the list, then removes it", async () => {
    const phrase = "e2e-macro";
    const before = await ruleCount();

    await $('[data-testid="commands-add"]').click();
    await $('[data-testid="action-insert"]').click();
    await $('[data-testid="commands-phrases"]').setValue(phrase);
    await $('[data-testid="commands-template"]').setValue("Mit freundlichen Grüßen");
    await $('[data-testid="commands-save"]').click();

    await waitForRuleCount(before + 1);
    await deleteRuleContaining(phrase);
    await waitForRuleCount(before);
  });

  it("adds a line-break command that needs no template, then removes it", async () => {
    const phrase = "e2e-umbruch";
    const before = await ruleCount();

    await $('[data-testid="commands-add"]').click();
    await $('[data-testid="action-line"]').click(); // switches away from the default 'insert'
    await $('[data-testid="commands-phrases"]').setValue(phrase);
    await $('[data-testid="commands-save"]').click();

    await waitForRuleCount(before + 1);
    await deleteRuleContaining(phrase);
    await waitForRuleCount(before);
  });

  it("edits an existing command's phrase, then removes it", async () => {
    const before = await ruleCount();

    await $('[data-testid="commands-add"]').click();
    await $('[data-testid="action-insert"]').click();
    await $('[data-testid="commands-phrases"]').setValue("e2e-alt");
    await $('[data-testid="commands-template"]').setValue("Text");
    await $('[data-testid="commands-save"]').click();
    await waitForRuleCount(before + 1);

    // Edit it: open the draft on that row, change the phrase, save.
    await (await rowContaining("e2e-alt")).$('[data-testid="rule-edit"]').click();
    await $('[data-testid="commands-phrases"]').setValue("e2e-neu");
    await $('[data-testid="commands-save"]').click();

    await browser.waitUntil(async () => (await rowContaining("e2e-neu")) !== undefined, {
      timeoutMsg: "the edited phrase did not appear",
    });

    await deleteRuleContaining("e2e-neu");
    await waitForRuleCount(before);
  });
});

const ruleCount = async () => (await $$('[data-testid="rule-row"]')).length;

const waitForRuleCount = (n: number) =>
  browser.waitUntil(async () => (await ruleCount()) === n, {
    timeout: 10_000,
    timeoutMsg: `the rule list did not settle at ${n} rows`,
  });

async function rowContaining(text: string) {
  for (const row of await $$('[data-testid="rule-row"]')) {
    if ((await row.getText()).includes(text)) return row;
  }
  return undefined;
}

async function deleteRuleContaining(text: string) {
  const row = await rowContaining(text);
  if (row) await row.$('[data-testid="rule-delete"]').click();
}
