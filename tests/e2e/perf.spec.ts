/// <reference types="node" />
// Frame-time regression gate (ADR 0006, ADR 0010). Runs dev/spike.html at each quality tier on
// - desktop: 1920x1080, DPR 1
// - phone proxy: 390x844, DPR 3, Chromium CPU throttling x4
// and records median / p95 frame time over PERF_SECONDS (default 10) after a 2 s warm-up.
// Vsync and the frame-rate limit are disabled so frame time measures real cost, not the display cap.
// Results: test-results/perf.json (override with PERF_OUT). Extra spike params: PERF_QUERY="ferns=4000&particles=8000".
// Scenarios also cover dev/forest.html (terrain + flora, "forest" rows). Run alone so other tests do not share the GPU: npx playwright test perf --workers=1
import { test, expect, type Browser } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SECONDS = Number(process.env.PERF_SECONDS ?? 10);
const EXTRA = process.env.PERF_QUERY ?? '';
const OUT = process.env.PERF_OUT ?? 'test-results/perf.json';
const TIERS = ['high', 'medium', 'low'] as const;

// Budget gates from ADR 0006: desktop high holds 60 fps; phone medium p95 <= 33 ms.
const GATES: Record<string, number> = { 'desktop/high': 1000 / 60, 'phone/medium': 1000 / 30, 'forest desktop/high': 1000 / 60, 'forest phone/medium': 1000 / 30 };

// An empty scene on any hardware GPU renders far faster than this; above it, other load is distorting the run.
const CONTROL_MAX_MS = 4;

const PROFILES = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, cpuThrottle: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, cpuThrottle: 4 },
} as const;

interface Result {
  scene: 'spike' | 'forest';
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
  errors: string[];
  /** Frames over 50 ms: [seconds into the recording, ms]. Tells a one-off hitch from steady jank. */
  longFrames: [number, number][];
}

const results: Result[] = [];
const meta: Record<string, unknown> = {};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

const round = (n: number) => Math.round(n * 100) / 100;

// Hardware GPU, not the smoke test's SwiftShader. Each scenario gets a fresh browser so GPU memory and
// GC work left by the previous scenario cannot land inside the next measurement window.
const GPU_ARGS = [
  '--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist',
  '--disable-dawn-features=use_dxc', // headless shell cannot load dxcompiler.dll on Windows; FXC works
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

async function measure(browser: Browser, profile: keyof typeof PROFILES, tier: string, extra = EXTRA, seconds = SECONDS, scene: 'spike' | 'forest' = 'spike'): Promise<Result> {
  const p = PROFILES[profile];
  const own = await browser.browserType().launch({ args: GPU_ARGS });
  const baseURL = test.info().project.use.baseURL;
  const context = await own.newContext({ baseURL, viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: p.isMobile, hasTouch: p.isMobile });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const query = `tier=${tier}${extra ? `&${extra}` : ''}`;
  await page.goto(`/dinosaur/dev/${scene}.html?${query}`);
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
  await page.waitForTimeout(seconds * 1000);
  const frames = await page.evaluate(() => window.__spike!.end());
  await context.close();
  await own.close();
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((a, b) => a + b, 0);
  const longFrames: [number, number][] = [];
  let at = 0;
  for (const f of frames) { at += f; if (f > 50) longFrames.push([round(at / 1000), round(f)]); }
  return {
    scene, profile, tier, query, config: info.config, trexLoaded: info.trexLoaded, frames: frames.length,
    medianMs: round(quantile(sorted, 0.5)), p95Ms: round(quantile(sorted, 0.95)), p99Ms: round(quantile(sorted, 0.99)),
    maxMs: round(sorted[sorted.length - 1] ?? NaN), meanFps: round((frames.length * 1000) / total), errors, longFrames,
  };
}

// Empty-scene control: a high value means other load on the machine, so the run is not trustworthy.
test('control empty scene frame time', async ({ browser }) => {
  const r = await measure(browser, 'desktop', 'high', 'ferns=0&particles=0&trex=0', 4);
  meta.control = { medianMs: r.medianMs, p95Ms: r.p95Ms, maxMs: r.maxMs, maxAllowedP95Ms: CONTROL_MAX_MS, note: 'desktop, empty scene; ~1.8 ms p95 on the idle reference iGPU' };
});

for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
  for (const tier of TIERS) {
    test(`${profile} ${tier} frame time`, async ({ browser }) => {
      const r = await measure(browser, profile, tier);
      results.push(r);
      test.info().annotations.push({ type: 'perf', description: `${profile}/${tier}: median ${r.medianMs} ms, p95 ${r.p95Ms} ms (${r.frames} frames)` });
    });
  }
}

// Forest scene (terrain + all flora, task #25, ADR 0010 section 4): the intro path looped, so measured frames include view changes.
// This is the whole frame budget; other scene content (dinosaurs, atmosphere) is measured by its own scenarios.
for (const profile of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) {
  for (const tier of TIERS) {
    test(`forest ${profile} ${tier} frame time`, async ({ browser }) => {
      const r = await measure(browser, profile, tier, 'play=loop', SECONDS, 'forest');
      results.push(r);
      test.info().annotations.push({ type: 'perf', description: `forest ${profile}/${tier}: median ${r.medianMs} ms, p95 ${r.p95Ms} ms (${r.frames} frames)` });
    });
  }
}

// Gates run last so every scenario is measured and written even when one is over budget.
test('budget gates (ADR 0006, ADR 0010)', async () => {
  test.skip(results.length === 0, 'no scenarios measured (filtered by --grep)');
  for (const r of results) expect.soft(r.errors, `${r.scene} ${r.profile}/${r.tier} console errors`).toEqual([]);
  // Software adapters (CI without a GPU) cannot judge smoothness; report but do not gate.
  const software = meta.backend !== 'webgpu' || /swiftshader|llvmpipe|software/i.test(String(meta.adapter));
  test.skip(software, `no hardware WebGPU adapter (${meta.backend}, ${meta.adapter}); perf gate not applicable`);
  const control = meta.control as { p95Ms: number } | undefined;
  if (control) expect(control.p95Ms, 'empty-scene control p95 (ms): the machine is busy, rerun on an idle machine').toBeLessThanOrEqual(CONTROL_MAX_MS);
  for (const r of results) {
    const gate = GATES[`${r.scene === 'forest' ? 'forest ' : ''}${r.profile}/${r.tier}`];
    if (gate === undefined) continue;
    expect.soft(r.frames, `${r.scene} ${r.profile}/${r.tier} frames recorded`).toBeGreaterThan(SECONDS * 20);
    expect.soft(r.p95Ms, `${r.scene} ${r.profile}/${r.tier} p95 frame time (ms)`).toBeLessThanOrEqual(gate);
    expect.soft(r.maxMs, `${r.scene} ${r.profile}/${r.tier} longest frame (ms), rubric P3`).toBeLessThan(100);
  }
});

test.afterAll(async ({ browserName }, info) => {
  if (!results.length) return;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    date: new Date().toISOString(), browser: browserName, project: info.project.name, seconds: SECONDS,
    method: 'rAF interval, vsync + frame-rate limit off, 2 s warm-up; phone = 390x844 DPR3 + CPU throttle x4',
    gates: GATES, ...meta, results,
  }, null, 2));
});
