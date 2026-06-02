import { test, expect } from '../playwright-fixture';

/**
 * Daily Rundown — assignee integrity.
 *
 * The XUN <> Five Crowns Sync card surfaces Claap-extracted action items
 * with `@mentions` like Jerry Mikolajczyk and Kevin Grapes, who are
 * external contacts (not internal tenant users). The suggested-tasks
 * resolver must never render these names as assignees — they should
 * either resolve to an internal member or fall back to "Unassigned"
 * (with the raw mention shown as muted "mentioned: <name>" context).
 */

const EXTERNAL_NAMES = ['Jerry Mikolajczyk', 'Kevin Grapes'];

test('Daily Rundown XUN <> Five Crowns Sync card never assigns external contacts', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();

  // Locate the meeting card by its title. If the fixture is not on the
  // current dashboard view, skip rather than fail — this test guards
  // against regression but does not require the card to always be present.
  const card = page.locator('[data-meeting-card]', {
    hasText: 'XUN <> Five Crowns Sync',
  }).first();

  if ((await card.count()) === 0) {
    test.skip(true, 'XUN <> Five Crowns Sync card not present on current dashboard.');
    return;
  }

  await expect(card).toBeVisible();

  // Wait for any suggested-tasks list to render.
  await page.waitForTimeout(500);

  // Collect every assignee chip rendered inside the card — both
  // direct internal mentions and deal-manager fallbacks. Neither
  // variant should ever contain an external contact name.
  const assigneeChips = card.locator(
    '[data-assignee-chip="internal"], [data-assignee-chip="deal-manager"]',
  );
  const chipCount = await assigneeChips.count();

  // The XUN <> Five Crowns Sync card has three Claap action items. With
  // the deal-manager fallback enabled, none of them should render as
  // "Unassigned" when the linked deal has an internal manager.
  const unassignedCount = await card
    .locator('[data-assignee-chip="unassigned"]')
    .count();
  expect(unassignedCount).toBe(0);

  for (let i = 0; i < chipCount; i++) {
    const text = (await assigneeChips.nth(i).innerText()).trim();
    for (const ext of EXTERNAL_NAMES) {
      expect(
        text,
        `External contact "${ext}" must not appear as a Rundown assignee`,
      ).not.toContain(ext);
    }
  }

  // Sanity: if the card mentions an external name at all, it must appear
  // only inside the muted "mentioned: ..." context, never inside an
  // internal-assignee chip.
  for (const ext of EXTERNAL_NAMES) {
    const mentionedNode = card.locator(`text=mentioned: ${ext}`);
    const internalChipWithName = card.locator(
      `[data-assignee-chip="internal"]:has-text("${ext}"), [data-assignee-chip="deal-manager"]:has-text("${ext}")`,
    );
    expect(await internalChipWithName.count()).toBe(0);
    // If present at all, it must be in the mentioned: variant.
    const anywhere = await card.locator(`text=${ext}`).count();
    if (anywhere > 0) {
      expect(await mentionedNode.count()).toBeGreaterThan(0);
    }
  }
});