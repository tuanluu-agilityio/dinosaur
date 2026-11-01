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

    const r = await page.evaluate(() => {
      const d = (window as any).__dev;
      let inClearing = 0;
      for (const sp of Object.keys(d.placements)) for (const p of d.placements[sp]) if (d.inClearing(p.x, p.z)) inClearing++;
      const inst = Object.fromEntries(Object.entries(d.meshes).map(([k, m]: any) => [k, m.count]));
      return { counts: d.counts, inst, budget: d.budget, inClearing };
    });
    expect(r.counts.fern).toBe(r.budget.ferns);
    expect(r.counts.cycad).toBe(r.budget.cycads);
    expect(r.counts.conifer).toBe(r.budget.conifers);
    expect(r.inst).toEqual(r.counts);
    expect(r.inClearing).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('only late-Cretaceous flora, no grass', async ({ page }) => {
  await page.goto('/dinosaur/dev/forest.html?tier=low&manual');
  await page.waitForSelector('html[data-ready="1"]', { timeout: 45_000 });
  const names = await page.evaluate(() => Object.values((window as any).__dev.meshes).map((m: any) => m.name));
  expect(names.sort()).toEqual(['flora-conifer', 'flora-cycad', 'flora-fern', 'flora-shrub']);
});
