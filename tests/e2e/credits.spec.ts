import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest: { species: string; author: string; license: string; sourceUrl: string; modifications: string[]; status: string }[] =
  JSON.parse(readFileSync('assets/manifest.json', 'utf8'));

const approved = manifest.filter((m) => m.status === 'approved');

const speciesRequests: string[] = [];

async function open(page: Page, w = 1280, h = 800) {
  page.on('request', (r) => { if (r.url().includes('/content/species/')) speciesRequests.push(r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') throw new Error(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => { throw e; });
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dinosaur/dev/panel.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('html[data-ready="1"]');
  await page.evaluate(async () => {
    const url = '/dinosaur/src/ui/credits.ts';
    const { Credits } = await import(/* @vite-ignore */ url);
    new Credits(document.getElementById('ui')!);
  });
}

test('each approved model appears with author, link and licence; candidates do not', async ({ page }) => {
  await open(page);
  await expect(page.locator('.dino-credits')).toBeHidden();
  speciesRequests.length = 0;
  await page.waitForTimeout(500);
  expect(speciesRequests).toEqual([]);
  await page.locator('.dino-credits-btn').click();
  const dlg = page.locator('.dino-credits__box');
  await expect(dlg).toBeVisible();
  expect(approved.length).toBeGreaterThanOrEqual(2);
  for (const m of approved) {
    const li = dlg.locator(`li[data-species="${m.species}"]`);
    await expect(li).toContainText(m.author);
    await expect(li).toContainText(m.license);
    await expect(li.locator(`a[href="${m.sourceUrl}"]`)).toHaveCount(1);
    await expect(li.locator('.dino-credits__tag')).toHaveCount(m.modifications.length > 0 ? 1 : 0);
  }
  for (const m of manifest.filter((e) => e.status !== 'approved')) await expect(dlg.locator(`li[data-species="${m.species}"]`)).toHaveCount(0);
  await expect(dlg).toContainText('felix.blume');
  await expect(dlg).toContainText('Aurelia');
  await expect(dlg).toContainText('MIT');
});

test('closes with the button and Escape; switches language', async ({ page }) => {
  await open(page, 390, 844);
  await page.locator('.dino-credits-btn').click();
  await expect(page.locator('.dino-credits__box h2')).toHaveText('Credits and licences');
  await page.locator('.dino-credits__close').click();
  await expect(page.locator('.dino-credits')).toBeHidden();
  await page.locator('.dino-controls__lang').click();
  await page.locator('.dino-credits-btn').click();
  await expect(page.locator('.dino-credits__box h2')).toHaveText('Ghi công và giấy phép');
  await page.keyboard.press('Escape');
  await expect(page.locator('.dino-credits')).toBeHidden();
});

test('Tab and Shift+Tab stay inside the dialog', async ({ page }) => {
  await open(page);
  await page.locator('.dino-credits-btn').click();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('.dino-credits__box'));
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); expect(await inside()).toBe(true); }
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside()).toBe(true); }
  await expect(page.locator('.dino-credits__box')).toHaveAttribute('aria-labelledby', 'dino-credits-title');
});
