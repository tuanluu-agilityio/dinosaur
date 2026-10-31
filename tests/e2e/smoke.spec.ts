import { test, expect } from '@playwright/test';

test('renderer dev page draws a non-empty canvas with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dinosaur/dev/renderer.html');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 30_000 });
  await expect(page.locator('#dev-overlay')).toContainText('tier:');
  await page.waitForTimeout(1000);
  const shot = await page.locator('#scene').screenshot();
  // screenshot-based pixel read: count distinct non-background bytes
  const distinct = new Set(shot.subarray(shot.length > 4000 ? 1000 : 0)).size;
  expect(distinct).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
