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
          if (sp === 'conifer') for (const h of [24, 17, 10]) if (!isClearOfIntro(p.x, p.z, h * p.scale, 5.5 * p.scaleXZ)) nearPath++;
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
