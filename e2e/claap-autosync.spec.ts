import { test, expect } from '@playwright/test';

/**
 * E2E: Daily Rundown auto-syncs Claap recording content without the user
 * having to click "Refresh".
 *
 * Opens /insights, locates the Decathlon <> 5th Line card, and asserts:
 *   1) the "Claap summary not yet available …" banner is NOT showing once
 *      the background sync completes (we give the realtime / on-open hook
 *      up to 15s — the cron runs every 10 min, the on-card-open hook fires
 *      immediately, and the realtime subscription flips the UI as soon as
 *      claap_recordings.summary lands).
 *   2) at least one suggested task row renders for the meeting.
 *
 * Skips gracefully if the card isn't on the current dashboard for this user.
 */
test('Daily Rundown auto-syncs Claap summary for Decathlon <> 5th Line', async ({ page }) => {
  await page.goto('/insights');

  const card = page.locator('text=/Decathlon\\s*<>\\s*5th Line/i').first();
  if ((await card.count()) === 0) {
    test.skip(true, 'Decathlon <> 5th Line card is not present on this dashboard.');
    return;
  }

  await card.scrollIntoViewIfNeeded();

  // The "not yet available" banner may flash briefly while the on-open hook
  // is running. Wait up to 15s for it to disappear.
  const banner = page.locator(
    'text=/Claap summary not yet available for this recording/i',
  );
  await expect(banner).toHaveCount(0, { timeout: 15_000 });

  // And we should see at least one suggested task render for this card.
  const suggested = page
    .locator('[data-suggested-task-row], text=/Suggested tasks/i')
    .first();
  await expect(suggested).toBeVisible({ timeout: 5_000 });
});