// WebGPU unavailable (Review Focus 1, ADR 0006, scene rubric P4): Chromium launched with WebGPU disabled
// must run the full app on the WebGL2 backend: it loads, a dinosaur can be clicked, the panel opens and
// narration starts, nothing logs a console error, and no compute pass ever runs.
// Also checks the live quality governor (src/app/quality-runtime.ts): a sustained low frame rate
// downgrades the running scene one tier without a reload.
// Needs the app's dev hooks: window.__app (src/app/app.ts) and window.__quality (installQualityProbe).
import { test, expect, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */

// WebGPU off; WebGL2 on the hardware GPU (on SwiftShader the full forest renders well under 1 fps). Hold the GPU lock.
test.use({ launchOptions: { args: ['--disable-features=WebGPU', '--enable-gpu', '--ignore-gpu-blocklist'] } });
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

// The narrator's element factory is window.Audio; record instead of playing (audio files are not needed).
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

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(MOCK_AUDIO);
  await page.addInitScript(() => localStorage.setItem('dino.lang', 'en'));
  await page.goto(`/dinosaur/?${query}`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 150_000 });
  await page.waitForFunction(() => (window as any).__app?.director.state === 'forest', null, { timeout: 30_000 });
  return errors;
}

const frames = (page: Page, n: number) =>
  page.evaluate((k) => new Promise<void>((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

test('no WebGPU: full app on WebGL2, click opens panel and narration, no compute, no console errors', async ({ page }) => {
  const errors = await open(page, 'noIntro');
  // navigator.gpu may still exist, but no adapter is handed out.
  expect(await page.evaluate(async () => (await (navigator as any).gpu?.requestAdapter()) ?? null)).toBeNull();
  const q = await page.evaluate(() => ({ backend: window.__quality!.backend, tier: window.__quality!.tier, verlet: window.__quality!.budget.verlet }));
  expect(q).toEqual({ backend: 'webgl2', tier: 'low', verlet: false });

  // The canvas shows the scene (not a blank clear colour).
  await frames(page, 5);
  const shot = await page.locator('canvas#scene').screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);

  // Click the T. rex: close-up, panel, narration.
  await page.evaluate(() => (window as any).__app.freeze(true));
  await page.evaluate(() => (window as any).__app.lookAt('tyrannosaurus'));
  await frames(page, 2);
  const p = await page.evaluate(() => (window as any).__app.screenOf('tyrannosaurus'));
  await page.mouse.click(p.x, p.y);
  await page.evaluate(() => (window as any).__app.freeze(false));
  await page.waitForFunction(() => (window as any).__app.director.state === 'closeup', null, { timeout: 20_000 });
  await expect(page.locator('.dino-panel')).toBeVisible();
  await expect(page.locator('.dino-panel__title')).toHaveText('Tyrannosaurus rex');
  const playing = () => page.evaluate(() => (window as any).__audios.filter((a: any) => a.playing).map((a: any) => a.src as string));
  expect(await playing()).toEqual([expect.stringContaining('audio/en/tyrannosaurus.behavior.mp3')]);

  // A section button switches narration; back returns to the forest and stops it.
  await page.locator('[data-section="anatomy"] button').click();
  expect(await playing()).toEqual([expect.stringContaining('audio/en/tyrannosaurus.anatomy.mp3')]);
  await page.locator('.dino-panel__back').click();
  await page.waitForFunction(() => (window as any).__app.director.state === 'forest', null, { timeout: 20_000 });
  expect(await playing()).toEqual([]);

  expect(await page.evaluate(() => window.__quality!.computeCalls())).toBe(0);
  expect(errors).toEqual([]);
});

test('governor: sustained low frame rate downgrades the running scene live, one tier at a time', async ({ page }) => {
  const errors = await open(page, 'noIntro&tier=high');
  const before = await page.evaluate(() => window.__quality!.stats());
  expect(before.tier).toBe('high');
  expect(before.atmosphere).toMatchObject({ godrays: true, shadows: true });

  // Burn 60 ms of main-thread time per frame: ~16 fps, well below the 28 fps governor threshold.
  await page.evaluate(() => {
    const burn = () => { const t = performance.now(); while (performance.now() - t < 60) { /* spin */ } requestAnimationFrame(burn); };
    requestAnimationFrame(burn);
  });
  await page.waitForFunction(() => window.__quality!.tier === 'medium', null, { timeout: 60_000 });
  const after = await page.evaluate(() => window.__quality!.stats());
  // Every gated effect follows BUDGETS.medium without a reload.
  expect(after.atmosphere).toMatchObject({ godrays: false, shadows: false, particles: 10000 });
  expect(after.vegetation).toEqual({ fern: 3000, cycad: 225, conifer: 90, shrub: 225 });
  // The switch's own fade frames do not count, so the slow frames of one switch cannot cause the next.
  await page.waitForTimeout(3000);
  const h = await page.evaluate(() => window.__quality!.history);
  expect(h).toEqual([expect.objectContaining({ from: 'high', to: 'medium', reason: 'governor' })]);
  expect(errors).toEqual([]);
});
