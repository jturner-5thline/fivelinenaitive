import { test, expect } from '../playwright-fixture';

test('email body wrappers never clip horizontally in detail pane', async ({ page }) => {
  await page.goto('/deals');

  await expect(page.locator('body')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>([
      '.email-message-shell',
      '.email-body',
      '.email-html-body',
      '[data-inbox-surface-scope="message"]',
    ].join(',')));

    return nodes.map((node) => ({
      className: node.className,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowX: getComputedStyle(node).overflowX,
    }));
  });

  for (const item of metrics) {
    if (!item.className) continue;
    const allowsHorizontalScroll = item.overflowX === 'auto' || item.overflowX === 'scroll';
    expect(item.scrollWidth > item.clientWidth ? allowsHorizontalScroll : true).toBeTruthy();
  }
});