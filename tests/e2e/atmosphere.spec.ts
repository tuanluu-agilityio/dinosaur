/// <reference types="node" />
// Atmosphere (P3-T02): particles follow BUDGETS[tier], godrays only on high, WebGL2 fallback builds
// without compute nodes. The perf block measures dev/atmosphere.html with the same method as
// tests/e2e/perf.spec.ts (rAF interval, vsync off, fresh browser per scenario); it runs only with
// ATMO_PERF=1 on a hardware GPU and writes test-results/perf-atmosphere.json (override ATMO_PERF_OUT).
import { test, expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BUDGETS } from '../../src/core/budgets';

type Tier = 'low' | 'medium' | 'high';

interface AtmoStats {
  tier: Tier;
  particles: number;
  particlesDrawn: number;
  godrays: boolean;
  shadows: boolean;
  fog: boolean;
  contactShadows: boolean;
  /** True while a tier switch is still fading particles or godrays. */
  transitioning: boolean;
}

async function open(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/dinosaur/dev/atmosphere.html?${query}`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 60_000 });
  return errors;
}

const stats = (page: Page) => page.evaluate(() => (window as any).__atmo.stats() as AtmoStats);
const frameCount = (page: Page) => page.evaluate(() => (window as any).__atmo.frame as number);
/** renderer.info.compute.calls: compute dispatches since start, counted by the renderer itself. */
const computeCalls = (page: Page) => page.evaluate(() => (window as any).__atmo.computeCalls() as number);

/** Switch tier and wait until the cross-fade (particles, godrays) has settled. */
async function setTier(page: Page, tier: Tier) {
  await page.evaluate((t) => (window as any).__atmo.setTier(t), tier);
  await page.waitForFunction(() => !(window as any).__atmo.stats().transitioning, null, { timeout: 30_000 });
  const f = await frameCount(page);
  await page.waitForFunction((n) => (window as any).__atmo.frame > n + 3, f, { timeout: 30_000 });
}

test('tier sets the particle count and enables godrays only on high', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page, 'tier=high');
  expect(await computeCalls(page)).toBe(0);
  let s = await stats(page);
  expect(s.tier).toBe('high');
  expect(s.particles).toBe(BUDGETS.high.particles);
  expect(s.particlesDrawn).toBe(BUDGETS.high.particles);
  expect(s.godrays).toBe(true);
  expect(s.shadows).toBe(BUDGETS.high.shadows);
  expect(s.fog).toBe(true);

  for (const tier of ['medium', 'low', 'high'] as const) {
    await setTier(page, tier);
    s = await stats(page);
    expect(s.tier).toBe(tier);
    expect(s.particles, `${tier} particles`).toBe(BUDGETS[tier].particles);
    expect(s.particlesDrawn, `${tier} drawn particles`).toBe(BUDGETS[tier].particles);
    expect(s.godrays, `${tier} godrays`).toBe(tier === 'high' && BUDGETS[tier].godrays);
    expect(s.shadows, `${tier} shadows`).toBe(BUDGETS[tier].shadows);
    expect(s.contactShadows, `${tier} contact shadows replace the shadow map`).toBe(!BUDGETS[tier].shadows);
  }
  expect(await frameCount(page)).toBeGreaterThan(10);
  expect(await computeCalls(page)).toBe(0);
  expect(errors).toEqual([]);
});

test('WebGL2 fallback builds the atmosphere without compute nodes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await open(page, 'tier=medium&webgl=1');
  const backend = await page.evaluate(() => (window as any).__atmo.backend as string);
  expect(backend).toBe('webgl2');
  const s = await stats(page);
  expect(s.particles).toBe(BUDGETS.medium.particles);
  expect(s.godrays).toBe(false);
  const f = await frameCount(page);
  await page.waitForFunction((n) => (window as any).__atmo.frame > n + 10, f, { timeout: 30_000 });
  await setTier(page, 'low');
  expect((await stats(page)).particles).toBe(BUDGETS.low.particles);
  expect(await frameCount(page)).toBeGreaterThan(10);
  expect(await computeCalls(page)).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// Frame-time measurement (ADR 0006, ADR 0010). Opt-in: ATMO_PERF=1 npx playwright test atmosphere --workers=1

const PERF = process.env.ATMO_PERF === '1';
const SECONDS = Number(process.env.PERF_SECONDS ?? 10);
const OUT = process.env.ATMO_PERF_OUT ?? 'test-results/perf-atmosphere.json';
// Layers: "base" = ground, placeholder trunks, lights only; each later layer adds one atmosphere feature.
const LAYERS: Record<string, string> = {
  base: 'particles=0&fog=0&godrays=0',
  particles: 'fog=0&godrays=0',
  fog: 'godrays=0',
  full: '',
};
const ONLY = process.env.ATMO_LAYERS?.split(',') ?? Object.keys(LAYERS);
const PROFILES = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, cpuThrottle: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, cpuThrottle: 4 },
} as const;
const GPU_ARGS = [
  '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-dawn-features=use_dxc', '--disable-gpu-vsync', '--disable-frame-rate-limit',
];
const results: Record<string, unknown>[] = [];
const meta: Record<string, unknown> = {};
const round = (n: number) => Math.round(n * 100) / 100;
const q = (s: number[], p: number) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))] ?? NaN;

async function measure(browser: Browser, profile: keyof typeof PROFILES, tier: Tier, extra: string, seconds = SECONDS) {
  const p = PROFILES[profile];
  const own = await browser.browserType().launch({ args: GPU_ARGS });
  const context = await own.newContext({ baseURL: test.info().project.use.baseURL, viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: p.isMobile, hasTouch: p.isMobile });
  const page = await context.newPage();
  const errors = await open(page, `tier=${tier}${extra ? `&${extra}` : ''}`);
  if (p.cpuThrottle > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: p.cpuThrottle });
  const info = await page.evaluate(() => { const a = (window as any).__atmo; return { backend: a.backend, adapter: a.adapter, stats: a.stats() }; });
  meta.backend = info.backend;
  meta.adapter = info.adapter;
  await page.waitForTimeout(2000);
  await page.evaluate(() => (window as any).__atmo.begin());
  await page.waitForTimeout(seconds * 1000);
  const frames: number[] = await page.evaluate(() => (window as any).__atmo.end());
  await context.close();
  await own.close();
  const sorted = [...frames].sort((a, b) => a - b);
  // Frames over 50 ms with their time into the recording: tells a one-off hitch from steady jank.
  const longFrames: [number, number][] = [];
  let at = 0;
  for (const f of frames) { at += f; if (f > 50) longFrames.push([round(at / 1000), round(f)]); }
  return { profile, tier, query: extra, stats: info.stats, frames: frames.length, medianMs: round(q(sorted, 0.5)), p95Ms: round(q(sorted, 0.95)), p99Ms: round(q(sorted, 0.99)), maxMs: round(sorted[sorted.length - 1] ?? NaN), longFrames, errors };
}

test.describe('atmosphere frame time', () => {
  test.skip(!PERF, 'set ATMO_PERF=1 on a machine with a hardware WebGPU adapter');
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test('control empty scene', async ({ browser }) => {
    const r = await measure(browser, 'desktop', 'high', 'particles=0&fog=0&godrays=0&trunks=0&shadows=0&dino=0', 4);
    meta.control = { medianMs: r.medianMs, p95Ms: r.p95Ms, maxMs: r.maxMs, maxAllowedP95Ms: 4 };
  });

  // Same empty scene on the throttled phone proxy: hitches here are the machine/browser, not the atmosphere.
  test('control empty scene phone', async ({ browser }) => {
    const r = await measure(browser, 'phone', 'low', 'particles=0&fog=0&godrays=0&trunks=0&shadows=0&dino=0', 6);
    meta.controlPhone = { medianMs: r.medianMs, p95Ms: r.p95Ms, maxMs: r.maxMs, longFrames: r.longFrames };
  });

  for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
    for (const tier of ['high', 'medium', 'low'] as const) {
      for (const layer of ONLY) {
        test(`${profile} ${tier} ${layer}`, async ({ browser }) => {
          const r = await measure(browser, profile, tier, LAYERS[layer]);
          results.push({ layer, ...r });
          test.info().annotations.push({ type: 'perf', description: `${profile}/${tier}/${layer}: median ${r.medianMs} ms, p95 ${r.p95Ms} ms` });
        });
      }
    }
  }

  test.afterAll(() => {
    if (!results.length) return;
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({
      date: new Date().toISOString(), seconds: SECONDS, page: 'dev/atmosphere.html',
      method: 'rAF interval, vsync + frame-rate limit off, 2 s warm-up; phone = 390x844 DPR3 + CPU throttle x4',
      layers: LAYERS, ...meta, results,
    }, null, 2));
  });
});
