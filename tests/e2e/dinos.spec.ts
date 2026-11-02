import { test, expect } from '@playwright/test';

const open = async (page: import('@playwright/test').Page, query: string) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/dinosaur/dev/dinos.html?${query}`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 120_000 });
  return errors;
};

test('only approved species spawn, variant follows the tier, clips come from the manifest', async ({ page }) => {
  for (const [tier, variant] of [['high', 'high'], ['medium', 'low']] as const) {
    const errors = await open(page, `tier=${tier}&manual&noveg&herd=2`);
    const r = await page.evaluate(() => ({ info: (window as any).__dev.info(), skipped: (window as any).__dev.skipped }));
    expect(r.skipped).toContain('pachycephalosaurus');
    expect([...new Set(r.info.map((d: any) => d.id))].sort()).toEqual(['triceratops', 'tyrannosaurus']);
    for (const d of r.info) {
      expect(d.variant).toBe(variant);
      expect(d.focusRadius).toBeGreaterThan(2);
      expect(d.clips).toEqual(expect.arrayContaining(['idle', 'walk']));
    }
    expect(errors).toEqual([]);
  }
});

test('dinosaurs stay inside the clearing, walk, and switch clips with speed', async ({ page }) => {
  const errors = await open(page, 'tier=medium&manual&noveg&herd=3');
  const r = await page.evaluate(() => {
    const d = (window as any).__dev;
    const seen = new Set<string>();
    let outside = 0, minHerd = 1e9, maxNearest = 0, minCross = 1e9;
    for (let i = 0; i < 4000; i++) {
      d.step(0.1);
      const info = d.info();
      for (const m of info) {
        seen.add(`${m.id}:${m.clip}`);
        const dx = (m.x - 6) / 22, dz = (m.z + 35) / 26;
        if (dx * dx + dz * dz > 1) outside++;
      }
      const rex = info.find((m: any) => m.id === 'tyrannosaurus');
      for (const m of info) if (m.id !== rex.id) minCross = Math.min(minCross, Math.hypot(m.x - rex.x, m.z - rex.z));
      const tri = info.filter((m: any) => m.id === 'triceratops');
      for (const a of tri) {
        let near = 1e9;
        for (const b of tri) if (a !== b) near = Math.min(near, Math.hypot(a.x - b.x, a.z - b.z));
        minHerd = Math.min(minHerd, near);
        maxNearest = Math.max(maxNearest, near);
      }
    }
    return { seen: [...seen], outside, minHerd, maxNearest, minCross };
  });
  expect(r.outside).toBe(0);
  expect(r.minCross).toBeGreaterThan(6); // the solo T. rex keeps clear of the herd
  expect(r.minHerd).toBeGreaterThanOrEqual(3 - 1e-3);
  expect(r.maxNearest).toBeLessThanOrEqual(8 + 1e-3);
  expect(r.seen).toEqual(expect.arrayContaining(['tyrannosaurus:idle', 'tyrannosaurus:walk', 'triceratops:walk']));
  expect(errors).toEqual([]);
});

test('picking hits a dinosaur proxy, misses empty sky, and the hover label shows the common name', async ({ page }) => {
  const errors = await open(page, 'tier=medium&manual&noveg&view=trex');
  await page.setViewportSize({ width: 1280, height: 720 });
  const hit = await page.evaluate(() => {
    const d = (window as any).__dev;
    d.setView('trex');
    d.camera.updateMatrixWorld(true);
    const trex = d.dinos.find((x: any) => x.id === 'tyrannosaurus');
    const p = d.screenOf(trex);
    return { p, id: d.pickAt(p.x, p.y), sky: d.pickAt(5, 5) };
  });
  expect(hit.id).toBe('tyrannosaurus');
  expect(hit.sky).toBeNull();
  await page.mouse.move(hit.p.x, hit.p.y);
  const label = page.locator('#label');
  await expect(label).toBeVisible();
  expect((await label.textContent())?.length).toBeGreaterThan(2);
  await page.mouse.move(2, 2);
  await expect(label).toBeHidden();
  expect(errors).toEqual([]);
});
