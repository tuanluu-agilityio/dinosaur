import { test, expect } from '@playwright/test';

const TIERS = ['low', 'medium', 'high'] as const;

for (const tier of TIERS) {
  test(`forest ${tier}: counts equal budgets, placement rules hold, no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/dinosaur/dev/forest.html?tier=${tier}`);
    await page.waitForSelector('html[data-ready="1"]', { timeout: 45_000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(async () => {
      const d = (window as any).__dev;
      const mod = '/dinosaur/src/camera/paths.ts';
      const { isClearOfIntro } = await import(/* @vite-ignore */ mod);
      let inClearing = 0, inWater = 0, nearPath = 0;
      for (const sp of Object.keys(d.placements)) {
        for (const p of d.placements[sp]) {
          if (d.inClearing(p.x, p.z)) inClearing++;
          if (p.y < -0.55) inWater++;
          // Independent check of the camera contract with enclosing spheres of the conifer crown.
          if (sp === 'conifer') {
            for (const h of [24, 17, 10]) if (!isClearOfIntro(p.x, p.z, h * p.scale, 5.5 * p.scaleXZ)) nearPath++;
            if (!isClearOfIntro(p.x, p.z, 1.6 * p.scale, 2.6 * p.scaleXZ)) nearPath++; // buttressed base
          }
          // Ferns sway up to 0.9 m at the tip: 1.2 m frond reach + 0.9 m.
          if (sp === 'fern' && !isClearOfIntro(p.x, p.z, 1.2 * p.scale, 2.1 * p.scaleXZ)) nearPath++;
        }
      }
      const inst = Object.fromEntries(Object.entries(d.meshes).map(([k, ms]: any) => [k, ms.reduce((a: number, m: any) => a + m.count, 0)]));
      let maxH = -1e9;
      for (let x = -130; x <= 130; x += 5) for (let z = -190; z <= 70; z += 5) maxH = Math.max(maxH, d.terrainHeight(x, z));
      return { counts: d.counts, inst, budget: d.budget, inClearing, inWater, nearPath, maxH };
    });
    expect(r.counts.fern).toBe(r.budget.ferns);
    expect(r.counts.cycad).toBe(r.budget.cycads);
    expect(r.counts.conifer).toBe(r.budget.conifers);
    expect(r.counts.shrub).toBe(r.budget.shrubs);
    expect(r.inst).toEqual(r.counts);
    expect(r.inClearing).toBe(0);
    expect(r.inWater).toBe(0);
    expect(r.nearPath).toBe(0);
    expect(r.maxH).toBeLessThan(8); // low floodplain banks, no peaks
    expect(errors).toEqual([]);
  });
}

test('only late-Cretaceous flora, no grass', async ({ page }) => {
  await page.goto('/dinosaur/dev/forest.html?tier=low&manual');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 45_000 });
  const names = await page.evaluate(() => Object.values((window as any).__dev.meshes).flat().map((m: any) => m.name));
  expect([...new Set(names)].sort()).toEqual(['flora-conifer', 'flora-cycad', 'flora-fern', 'flora-shrub']);
});

test('lower tiers are prefixes of the same seeded placement list', async ({ page }) => {
  await page.goto('/dinosaur/dev/forest.html?tier=low&manual');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 45_000 });
  const r = await page.evaluate(async () => {
    const mod = '/dinosaur/src/world/vegetation.ts';
    const { placeVegetation } = await import(/* @vite-ignore */ mod);
    const all = { low: placeVegetation('low'), medium: placeVegetation('medium'), high: placeVegetation('high') };
    const bad: string[] = [];
    for (const t of ['low', 'medium'] as const) {
      for (const sp of Object.keys(all.high)) {
        all[t][sp].forEach((p: unknown, i: number) => { if (JSON.stringify(p) !== JSON.stringify(all.high[sp][i])) bad.push(`${t} ${sp} ${i}`); });
      }
    }
    return { bad: bad.slice(0, 5), n: bad.length };
  });
  expect(r.n, r.bad.join(', ')).toBe(0);
});

test('tier switch only removes plants and fades them out', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dinosaur/dev/forest.html?tier=high');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 45_000 });
  const total = () => page.evaluate(() => Object.values((window as any).__dev.meshes).flat().reduce((a: number, m: any) => a + m.count, 0));
  const before = await page.evaluate(() => JSON.stringify((window as any).__dev.placements));
  const high = await total();
  await page.evaluate(() => (window as any).__dev.setTier('low'));
  const during = await total();
  // The fade takes 0.5 s of frame time; software rendering in CI draws only a few frames per second, so poll.
  await expect.poll(total, { timeout: 30_000 }).toBeLessThan(high);
  const r = await page.evaluate((json) => {
    const d = (window as any).__dev;
    const old = JSON.parse(json);
    let moved = 0;
    for (const sp of Object.keys(d.placements)) d.placements[sp].forEach((p: unknown, i: number) => { if (JSON.stringify(p) !== JSON.stringify(old[sp][i])) moved++; });
    const b = d.budget;
    return { moved, low: b.ferns + b.cycads + b.conifers + b.shrubs };
  }, before);
  expect(r.moved).toBe(0);
  expect(during).toBe(high); // removed plants are still drawn while they fade
  expect(await total()).toBe(r.low);
  expect(errors).toEqual([]);
});
