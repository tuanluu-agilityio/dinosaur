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
  // The error text follows the language switch (it is not frozen in the language it appeared in).
  const first = (await err.textContent()) ?? '';
  await page.locator('.dino-controls__lang').click();
  await expect.poll(async () => (await err.textContent()) ?? '').not.toBe(first);
  await expect(err).toContainText(/Could not load content|Không thể tải nội dung/);
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

test('high tier: the light forest model is replaced by the detail model on focus, in place', async ({ page }) => {
  watch(page);
  await page.goto('/dinosaur/?test&tier=high&governor=0&noIntro');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 150_000 });
  const before = await page.evaluate(() => (window as any).__app.world.dinos.map((d: any) => d.variant));
  expect(before.every((v: string) => v === 'low')).toBe(true);
  await page.evaluate(() => (window as any).__app.freeze(true));
  const at = await page.evaluate(() => { const d = (window as any).__app.world.dinos.find((x: any) => x.id === 'tyrannosaurus'); return d.root.position.toArray(); });
  await page.evaluate(() => (window as any).__app.lookAt('tyrannosaurus'));
  const p = await page.evaluate(() => (window as any).__app.screenOf('tyrannosaurus'));
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => (window as any).__app.world.dinos.find((x: any) => x.id === 'tyrannosaurus').variant), { timeout: 60_000 }).toBe('high');
  const after = await page.evaluate(() => { const w = (window as any).__app.world; const d = w.dinos.find((x: any) => x.id === 'tyrannosaurus'); return { pos: d.root.position.toArray(), count: w.dinos.length, sel: (window as any).__app.selected }; });
  expect(after.pos).toEqual(at); // swapped in place
  expect(after.count).toBe(before.length); // replaced, not added
  expect(after.sel).toBe('tyrannosaurus');
});
