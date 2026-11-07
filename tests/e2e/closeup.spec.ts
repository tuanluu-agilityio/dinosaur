import { test, expect, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Replaces window.Audio (the narrator's element factory) with a recorder; ambient uses a separate element.
const MOCK_AUDIO = () => {
  const list: any[] = [];
  class FakeAudio {
    src: string; playing = false;
    constructor(src: string) { this.src = src; list.push(this); }
    play() { this.playing = true; return Promise.resolve(); }
    pause() { this.playing = false; }
  }
  (window as any).Audio = FakeAudio;
  (window as any).__audios = list;
};

async function open(page: Page, lang: 'vi' | 'en' = 'en') {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(MOCK_AUDIO);
  await page.addInitScript((l) => localStorage.setItem('dino.lang', l), lang);
  await page.goto('/dinosaur/?tier=low&noIntro&noveg');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 120_000 });
  await page.waitForFunction(() => (window as any).__app.director.state === 'forest', null, { timeout: 30_000 });
  return errors;
}

const screenOf = (page: Page, id: string) =>
  page.evaluate((i) => (window as any).__app.screenOf(i), id) as Promise<{ x: number; y: number }>;
const playing = (page: Page) =>
  page.evaluate(() => (window as any).__audios.filter((a: any) => a.playing).map((a: any) => a.src as string));

async function clickDino(page: Page, id: string) {
  // Freeze the sim so the dino does not walk out from under the pointer.
  await page.evaluate(() => (window as any).__app.freeze(true));
  await page.evaluate((i) => (window as any).__app.lookAt(i), id);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const p = await screenOf(page, id);
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => (window as any).__app.freeze(false));
}

test('click T-rex: closeup within 2 s, panel in current language, behavior narration starts', async ({ page }) => {
  const errors = await open(page, 'en');
  const c0 = await page.evaluate(() => (window as any).__app.simClock);
  await clickDino(page, 'tyrannosaurus');
  await page.waitForFunction(() => (window as any).__app.director.state === 'closeup', null, { timeout: 30_000 });
  // Software GL runs few fps, so the 2 s budget is checked on the app's own clock (frame dt), not wall time.
  expect((await page.evaluate(() => (window as any).__app.simClock)) - c0).toBeLessThanOrEqual(2.2);
  await expect(page.locator('.dino-panel')).toBeVisible();
  await expect(page.locator('.dino-panel__title')).toHaveText('T. rex');
  expect(await playing(page)).toEqual([expect.stringContaining('audio/en/tyrannosaurus.behavior.mp3')]);
  expect(errors).toEqual([]);
});

test('click during flight is ignored; back returns to forest and stops narration', async ({ page }) => {
  await open(page);
  await clickDino(page, 'tyrannosaurus');
  expect(await page.evaluate(() => (window as any).__app.director.state)).toBe('flying');
  await page.evaluate(() => (window as any).__app.lookAt('triceratops'));
  const p = await screenOf(page, 'triceratops');
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => (window as any).__app.director.state === 'closeup', null, { timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__app.selected)).toBe('tyrannosaurus');
  await page.locator('.dino-panel__back').click();
  await page.waitForFunction(() => (window as any).__app.director.state === 'forest', null, { timeout: 15_000 });
  await expect(page.locator('.dino-panel')).toBeHidden();
  expect(await playing(page)).toEqual([]);
  expect(await page.evaluate(() => (window as any).__app.selected)).toBeNull();
});

test('language switch mid-narration swaps text and restarts the same section; one audio playing', async ({ page }) => {
  await open(page, 'en');
  await clickDino(page, 'tyrannosaurus');
  await page.waitForFunction(() => (window as any).__app.director.state === 'closeup', null, { timeout: 15_000 });
  await page.locator('[data-section="anatomy"] button').click();
  expect(await playing(page)).toEqual([expect.stringContaining('audio/en/tyrannosaurus.anatomy.mp3')]);
  const title = await page.locator('.dino-panel__title').textContent();
  await page.locator('.dino-controls__lang').click();
  await expect(page.locator('.dino-panel__title')).not.toHaveText(title!);
  expect(await playing(page)).toEqual([expect.stringContaining('audio/vi/tyrannosaurus.anatomy.mp3')]);
});
