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
  const b64 = shot.toString('base64');
  const ratio = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let diff = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i] - 11) + Math.abs(px[i + 1] - 15) + Math.abs(px[i + 2] - 12) > 24) diff++;
    }
    return diff / (px.length / 4);
  }, b64);
  expect(ratio).toBeGreaterThan(0.01);
  expect(errors).toEqual([]);
});
