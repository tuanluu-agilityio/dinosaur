import { test, expect } from '@playwright/test';

async function openCloseup(page: import('@playwright/test').Page) {
  await page.goto('/dinosaur/dev/camera.html?noIntro');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 30_000 });
  await page.evaluate(() => {
    const w = window as any;
    w.__dev.director.focus(w.__dev.dino, 5);
  });
  await page.waitForFunction(() => (window as any).__dev.director.state === 'closeup', null, { timeout: 15_000 });
}

test('drag rotates the camera in closeup', async ({ page }) => {
  await openCloseup(page);
  const before = await page.evaluate(() => (window as any).__dev.camera.position.toArray());
  const box = (await page.locator('#scene').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 150, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => (window as any).__dev.camera.position.toArray());
  expect(Math.hypot(...after.map((v: number, i: number) => v - before[i]))).toBeGreaterThan(0.5);
});

test('scroll zooms within min/max distance', async ({ page }) => {
  await openCloseup(page);
  const box = (await page.locator('#scene').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const dist = () =>
    page.evaluate(() => {
      const d = (window as any).__dev;
      return d.camera.position.distanceTo(d.controls.target) as number;
    });
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(800);
  expect(await dist()).toBeGreaterThanOrEqual(6 - 0.05);
  expect(await dist()).toBeLessThan(7);
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1200);
  expect(await dist()).toBeLessThanOrEqual(20 + 0.05);
  expect(await dist()).toBeGreaterThan(19);
});
