// Progressive loading and failure handling (task #35): intro starts before dinosaurs arrive; a failed model or content fetch degrades one item.
import { test, expect, type Page } from '@playwright/test';

test.setTimeout(180_000);

const URL = '/dinosaur/?test&tier=medium&governor=0';

function watch(page: Page): { warns: string[]; errors: string[] } {
  const r = { warns: [] as string[], errors: [] as string[] };
  page.on('console', (m) => { if (m.type() === 'warning') r.warns.push(m.text()); });
  page.on('pageerror', (e) => r.errors.push(String(e)));
  return r;
}

test('an aborted model hides that dinosaur, warns, and the others stay clickable', async ({ page }) => {
  const log = watch(page);
  await page.route('**/models/triceratops.*.glb', (r) => r.abort());
  await page.goto(`${URL}&noIntro`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 150_000 });
  const ids = await page.evaluate(() => (window as any).__app.world.dinos.map((d: any) => d.id));
  expect(ids).not.toContain('triceratops');
  expect(ids).toContain('tyrannosaurus');
  expect(log.warns.some((w) => w.includes('triceratops') && w.includes('failed to load'))).toBe(true);
  expect(log.errors).toEqual([]);
  // Another dinosaur still opens its panel.
  await page.evaluate(() => (window as any).__app.freeze(true));
  const id = ids.find((x: string) => x !== 'tyrannosaurus') ?? 'tyrannosaurus';
  await page.evaluate((i) => (window as any).__app.lookAt(i), id);
  const p = await page.evaluate((i) => (window as any).__app.screenOf(i), id);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => (window as any).__app.selected), { timeout: 20_000 }).toBe(id);
  await expect(page.locator('.dino-panel')).toBeVisible();
});

test('a failed content fetch shows loadError with retry, and retry opens the panel', async ({ page }) => {
  watch(page);
  let block = true;
  await page.route('**/content/species/tyrannosaurus.json', (r) => (block ? r.abort() : r.continue()));
  await page.goto(`${URL}&noIntro`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 150_000 });
  await page.evaluate(() => (window as any).__app.freeze(true));
  await page.evaluate(() => (window as any).__app.lookAt('tyrannosaurus'));
  const p = await page.evaluate(() => (window as any).__app.screenOf('tyrannosaurus'));
  await page.mouse.click(p.x, p.y);
  const err = page.locator('.dino-load-error');
  await expect(err).toBeVisible({ timeout: 20_000 });
  await expect(err).toContainText(/Could not load content|Không thể tải nội dung/);
  expect(await page.evaluate(() => (window as any).__app.selected)).toBeNull();
  block = false;
  await err.getByRole('button').click();
  await expect.poll(() => page.evaluate(() => (window as any).__app.selected), { timeout: 20_000 }).toBe('tyrannosaurus');
  await expect(err).toBeHidden();
});

test('slow model and content responses: the intro still plays and dinosaurs arrive later', async ({ page }) => {
  watch(page);
  await page.route(/\/(models\/.*\.glb|content\/species\/.*\.json)$/, async (r) => {
    await new Promise((res) => setTimeout(res, 4000));
    await r.continue();
  });
  await page.goto(URL);
  await page.waitForSelector('html[data-intro="1"]', { timeout: 150_000 });
  const early = await page.evaluate(() => ({ state: (window as any).__app.director.state, dinos: (window as any).__app.world.dinos.length }));
  expect(early.state).toBe('intro');
  expect(early.dinos).toBe(0);
  const t0 = await page.evaluate(() => (window as any).__app.simClock);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as any).__app.simClock)).toBeGreaterThan(t0); // frames keep rendering while content is pending
  await page.waitForSelector('html[data-ready="1"]', { timeout: 150_000 });
  expect(await page.evaluate(() => (window as any).__app.world.dinos.length)).toBeGreaterThan(0);
});
