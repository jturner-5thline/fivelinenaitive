import { test, expect } from '../playwright-fixture';

test('Sales & BD title and controls remain accessible after scrolling', async ({ page }) => {
  await page.goto('/insights?dashboard=sales-bd-page&tf=last12m');
  const header = page.locator('[data-sticky-dashboard-header]');
  const title = header.getByRole('heading', { name: 'Sales & BD', exact: true });
  await expect(title).toBeVisible();

  const scrollArea = page.locator('.main-scrollable');
  for (const position of [700, 1400]) {
    await scrollArea.evaluate((element, top) => { element.scrollTop = top; }, position);
    await expect.poll(async () => {
      const box = await header.boundingBox();
      return box?.y ?? 0;
    }).toBeGreaterThanOrEqual(68);
    await expect(title).toBeVisible();
    // A trial click detects the fixed navigation intercepting this control.
    await title.click({ trial: true });
  }
  await title.click();
  await expect(page.getByRole('menu')).toBeVisible();
});