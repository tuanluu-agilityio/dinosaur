import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, w: number, h: number) {
  page.on('console', (m) => { if (m.type() === 'error') throw new Error(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => { throw e; });
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dinosaur/dev/panel.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
}
const box = (page: Page) => page.locator('.dino-panel').boundingBox();
const scrollTop = (page: Page) =>
  page.evaluate(() => (document.querySelector('.dino-panel__body') as HTMLElement).scrollTop);

test('desktop: right-docked, 30-36 % width', async ({ page }) => {
  await open(page, 1280, 800);
  const b = (await box(page))!;
  expect(b.x + b.width).toBeCloseTo(1280, 0);
  expect(b.width / 1280).toBeGreaterThanOrEqual(0.3);
  expect(b.width / 1280).toBeLessThanOrEqual(0.36);
});

test('phone portrait: bottom sheet <= 55 %, draggable to 90 %', async ({ page }) => {
  await open(page, 390, 844);
  const b = (await box(page))!;
  expect(b.y + b.height).toBeCloseTo(844, 0);
  expect(b.height / 844).toBeLessThanOrEqual(0.55);
  const hb = (await page.locator('.dino-panel__handle').boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 5);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, 10, { steps: 8 });
  await page.mouse.up();
  const after = (await box(page))!;
  expect(after.height / 844).toBeGreaterThan(0.85);
  expect(after.height / 844).toBeLessThanOrEqual(0.901);
});

test('rotation to landscape docks right and keeps scroll', async ({ page }) => {
  await open(page, 390, 844);
  await page.evaluate(() => {
    const body = document.querySelector('.dino-panel__body') as HTMLElement;
    body.style.paddingBottom = '2000px';
    body.scrollTop = 120;
  });
  const before = await scrollTop(page);
  expect(before).toBeGreaterThan(50);
  await page.setViewportSize({ width: 844, height: 390 });
  const b = (await box(page))!;
  expect(b.x + b.width).toBeCloseTo(844, 0);
  expect(b.height).toBeCloseTo(390, 0);
  expect(Math.abs((await scrollTop(page)) - before)).toBeLessThan(2);
});

test('language toggle switches text without reload; facts, contested, sources render', async ({ page }) => {
  await open(page, 1280, 800);
  await page.evaluate(() => { (window as unknown as { __marker: number }).__marker = 1; });
  const first = page.locator('.dino-panel__section-title').first();
  const initial = await first.textContent();
  await page.locator('.dino-controls__lang').click();
  await expect(first).not.toHaveText(initial!);
  await page.locator('.dino-controls__lang').click();
  await expect(first).toHaveText(initial!);
  expect(await page.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(1);
  await expect(page.locator('.dino-panel__facts dd').nth(0)).toHaveText('11–12.3 m');
  await expect(page.locator('.dino-panel__facts dd').nth(2)).toHaveText('68–66 Ma');
  await expect(page.locator('.dino-panel__contested li')).toHaveCount(1);
  const link = page.locator('.dino-panel__sources a').first();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', 'https://example.org');
});

test('mute toggles dino.muted; back fires onBack', async ({ page }) => {
  await open(page, 1280, 800);
  await page.locator('.dino-controls__mute').click();
  expect(await page.evaluate(() => localStorage.getItem('dino.muted'))).toBe('1');
  await page.locator('.dino-controls__mute').click();
  expect(await page.evaluate(() => localStorage.getItem('dino.muted'))).toBe('0');
  await page.locator('.dino-panel__back').click();
  expect(await page.evaluate(() => (window as unknown as { __backCount: number }).__backCount)).toBe(1);
});
