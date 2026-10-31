/// <reference types="node" />
// Frame-time regression gate (ADR 0006, ADR 0010). Runs dev/spike.html at each quality tier on
// - desktop: 1920x1080, DPR 1
// - phone proxy: 390x844, DPR 3, Chromium CPU throttling x4
// and records median / p95 frame time over PERF_SECONDS (default 10) after a 2 s warm-up.
// Vsync and the frame-rate limit are disabled so frame time measures real cost, not the display cap.
// Results: test-results/perf.json (override with PERF_OUT). Extra spike params: PERF_QUERY="ferns=4000&particles=8000".
// Run alone so other tests do not share the GPU: npx playwright test perf --workers=1
import { test, expect, type Browser } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SECONDS = Number(process.env.PERF_SECONDS ?? 10);
const EXTRA = process.env.PERF_QUERY ?? '';
const OUT = process.env.PERF_OUT ?? 'test-results/perf.json';
const TIERS = ['high', 'medium', 'low'] as const;

// Budget gates from ADR 0006: desktop high holds 60 fps; phone medium p95 <= 33 ms.
const GATES: Record<string, number> = { 'desktop/high': 1000 / 60, 'phone/medium': 1000 / 30 };

const PROFILES = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, cpuThrottle: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, cpuThrottle: 4 },
} as const;

interface Result {
  profile: keyof typeof PROFILES;
  tier: string;
  query: string;
  config: unknown;
  trexLoaded: boolean;
  frames: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanFps: number;
}

const results: Result[] = [];
const meta: Record<string, unknown> = {};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

const round = (n: number) => Math.round(n * 100) / 100;

test.use({
  launchOptions: {
    args: [
      '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist',
      '--disable-dawn-features=use_dxc', // headless shell cannot load dxcompiler.dll on Windows; FXC works
      '--disable-gpu-vsync', '--disable-frame-rate-limit',
    ],
  },
});

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

async function measure(browser: Browser, profile: keyof typeof PROFILES, tier: string): Promise<Result> {
  const p = PROFILES[profile];
  const context = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: p.isMobile, hasTouch: p.isMobile });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const query = `tier=${tier}${EXTRA ? `&${EXTRA}` : ''}`;
  await page.goto(`/dinosaur/dev/spike.html?${query}`);
  await page.waitForSelector('html[data-ready="1"]', { timeout: 60_000 });
  if (p.cpuThrottle > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpuThrottle });
  }
  const info = await page.evaluate(() => {
    const s = window.__spike!;
    return { backend: s.backend, adapter: s.adapter, config: s.config, trexLoaded: s.trexLoaded };
  });
  meta.backend = info.backend;
  meta.adapter = info.adapter;
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__spike!.begin());
  await page.waitForTimeout(SECONDS * 1000);
  const frames = await page.evaluate(() => window.__spike!.end());
  await context.close();
  expect(errors).toEqual([]);
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((a, b) => a + b, 0);
  return {
    profile, tier, query, config: info.config, trexLoaded: info.trexLoaded, frames: frames.length,
    medianMs: round(quantile(sorted, 0.5)), p95Ms: round(quantile(sorted, 0.95)), p99Ms: round(quantile(sorted, 0.99)),
    maxMs: round(sorted[sorted.length - 1] ?? NaN), meanFps: round((frames.length * 1000) / total),
  };
}

for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
  for (const tier of TIERS) {
    test(`${profile} ${tier} frame time`, async ({ browser }) => {
      const r = await measure(browser, profile, tier);
      results.push(r);
      test.info().annotations.push({ type: 'perf', description: `${profile}/${tier}: median ${r.medianMs} ms, p95 ${r.p95Ms} ms (${r.frames} frames)` });
      const gate = GATES[`${profile}/${tier}`];
      if (gate === undefined) return;
      // Software adapters (CI without a GPU) cannot judge smoothness; report but do not gate.
      const software = meta.backend !== 'webgpu' || /swiftshader|llvmpipe|software/i.test(String(meta.adapter));
      test.skip(software, `no hardware WebGPU adapter (${meta.backend}, ${meta.adapter}); perf gate not applicable`);
      expect(r.frames, 'frames recorded').toBeGreaterThan(SECONDS * 20);
      expect(r.p95Ms, `${profile}/${tier} p95 frame time (ms)`).toBeLessThanOrEqual(gate);
    });
  }
}

test.afterAll(async ({ browserName }, info) => {
  if (!results.length) return;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    date: new Date().toISOString(), browser: browserName, project: info.project.name, seconds: SECONDS,
    method: 'rAF interval, vsync + frame-rate limit off, 2 s warm-up; phone = 390x844 DPR3 + CPU throttle x4',
    gates: GATES, ...meta, results,
  }, null, 2));
});
