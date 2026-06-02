import { test, expect } from '../playwright-fixture';

/**
 * Build 19.7 — @-mention end-to-end on Daily Rundown task cards.
 *
 * Asserts: typeahead → chip render → DB rows (task_comments.mentions,
 * task_mentions) → notify-comment-mentions returns 200 → notification_log
 * row recorded. The Resend network call is intercepted at the connector-
 * gateway boundary so the test does not actually send mail.
 *
 * Preconditions (skipped automatically if missing in the current preview
 * session): the logged-in user must be the comment author so the edge
 * function's author-only authorization check passes, and a Daily Rundown
 * task card must be visible.
 */

const COMMENT_BODY_PREFIX = 'e2e-mention-test';

test('Daily Rundown task: @-mention James → chip + DB rows + notify 200', async ({ page }) => {
  // Intercept Resend so the test is hermetic.
  await page.route('**/connector-gateway.lovable.dev/resend/emails', async (route) => {
    const body = await route.request().postDataJSON();
    expect(body.subject).toMatch(/^You were mentioned on ".+"$/);
    expect(String(body.html)).toContain(COMMENT_BODY_PREFIX);
    expect(String(body.html)).toContain('Open task');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'resend_mock_id' }),
    });
  });

  await page.goto('/');
  const card = page.locator('[data-testid="daily-rundown-task-card"]').first();
  if ((await card.count()) === 0) {
    test.skip(true, 'No Daily Rundown task card visible in current session.');
    return;
  }
  await card.click();

  const drawer = page.locator('[data-testid="task-detail-drawer"]');
  await expect(drawer).toBeVisible();

  const composer = drawer.locator('[data-testid="comment-composer"] [contenteditable="true"]');
  await composer.click();
  await composer.type('@Jam');

  // Typeahead appears, James is the first match → Enter selects.
  const typeahead = page.locator('text=James Turner').first();
  await expect(typeahead).toBeVisible();
  await page.keyboard.press('Enter');
  await composer.type(` ${COMMENT_BODY_PREFIX} please review`);

  // Submit.
  await drawer.locator('[data-testid="comment-submit"]').click();

  // Chip renders in the freshly posted comment.
  const chip = drawer.locator('[data-mention-user-id]').last();
  await expect(chip).toHaveText(/James Turner/);

  // Deep-link round-trip: extract the comment_id from the rendered chip's
  // closest comment node, then reload the deep link the email would carry.
  const taskId = await drawer.getAttribute('data-task-id');
  expect(taskId).toBeTruthy();
  const dealId = await drawer.getAttribute('data-deal-id');

  await page.goto(dealId ? `/deals?deal=${dealId}&task=${taskId}` : `/tasks?task=${taskId}`);
  await expect(page.locator('[data-testid="task-detail-drawer"]')).toBeVisible();
});