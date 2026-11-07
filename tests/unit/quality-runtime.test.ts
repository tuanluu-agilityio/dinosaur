import { describe, it, expect, vi } from 'vitest';
import { QualityRuntime, effectiveBudget, qualityParams } from '../../src/app/quality-runtime';
import { BUDGETS } from '../../src/core/budgets';

const renderer = { info: { compute: { calls: 0 } } } as any;
function rig(state: any = 'forest', opts: any = {}) {
  let fading = false;
  const atmo = { setTier: vi.fn((t: string) => { fading = BUDGETS[t as 'low'].shadows === false; }), stats: () => ({ transitioning: fading }) };
  const veg = { setTier: vi.fn() };
  const dir = { state };
  const swap = vi.fn(() => Promise.resolve());
  const rt = new QualityRuntime({ renderer, isWebGPU: true, tier: 'high', atmosphere: atmo, vegetation: veg, director: dir, swapDinoVariant: swap, warmupSec: 0, settleSec: 1, ...opts });
  return { rt, atmo, veg, dir, swap, endFade: () => { fading = false; } };
}
const run = (rt: QualityRuntime, sec: number, dtMs: number) => { for (let t = 0; t < sec * 1000; t += dtMs) rt.update(dtMs / 1000); };

describe('QualityRuntime', () => {
  it('downgrades live after a slow window and applies atmosphere + vegetation', () => {
    const { rt, atmo, veg } = rig();
    run(rt, 3.1, 40);
    expect(rt.tier).toBe('medium');
    expect(atmo.setTier).toHaveBeenCalledWith('medium');
    // flora keeps high-tier shadows with medium counts until the fade ends
    expect(veg.setTier).toHaveBeenCalledWith('high', { fern: 3000, cycad: 225, conifer: 90, shrub: 225 });
  });
  it('parks the shadow map the frame the sun fade ends; flora flags never flip', () => {
    const { rt, veg, atmo, endFade } = rig();
    const sun: any = { castShadow: true, shadow: { intensity: 1, autoUpdate: true, needsUpdate: false } };
    const lighting = { sun, shadows: true, transitioning: false };
    (atmo as any).lighting = lighting;
    renderer.shadowMap = { enabled: true };
    rt.forceTier('medium');
    lighting.transitioning = true; lighting.shadows = false;
    rt.update(0.016);
    expect(sun.shadow.autoUpdate).toBe(true);
    // Lighting finishes its fade and switches the map off; the runtime parks it before the frame renders.
    lighting.transitioning = false; sun.castShadow = false; sun.shadow.intensity = 0; renderer.shadowMap.enabled = false;
    veg.setTier.mockClear();
    rt.update(0.016);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(sun).toMatchObject({ castShadow: true, shadow: { intensity: 0, autoUpdate: false, needsUpdate: false } });
    endFade(); run(rt, 2, 16);
    expect(veg.setTier).not.toHaveBeenCalled();
    rt.forceTier('low');
    expect(veg.setTier).toHaveBeenLastCalledWith('high', { fern: 1500, cycad: 110, conifer: 45, shrub: 110 });
    delete (atmo as any).lighting;
  });
  it('without a sun the flora flags flip right after the switch', () => {
    const { rt, veg } = rig();
    rt.forceTier('medium');
    veg.setTier.mockClear();
    rt.update(0.016);
    expect(veg.setTier).toHaveBeenCalledWith('medium');
  });
  it('ignores frames while transitioning and during settle: no cascade', async () => {
    const { rt, endFade } = rig();
    run(rt, 3.1, 40);
    run(rt, 4, 40); // still fading: nothing counts
    expect(rt.tier).toBe('medium');
    endFade();
    rt.update(0); await new Promise((r) => setTimeout(r, 0)); // dino swap resolves
    run(rt, 0.9 + 2.9, 40); // settle 1 s + less than one full window
    expect(rt.tier).toBe('medium');
    run(rt, 0.5, 40);
    expect(rt.tier).toBe('low');
    expect(rt.history.map((h) => h.to)).toEqual(['medium', 'low']);
  });
  it('never upgrades, never below low; forceTier only lowers', () => {
    const { rt } = rig();
    expect(rt.forceTier('high')).toBe(false);
    expect(rt.forceTier('low')).toBe(true);
    expect(rt.forceTier('medium')).toBe(false);
    expect(rt.tier).toBe('low');
  });
  it('fast frames never downgrade; governor:false never downgrades', () => {
    const a = rig(); run(a.rt, 10, 10); expect(a.rt.tier).toBe('high');
    const b = rig('forest', { governor: false }); run(b.rt, 10, 100); expect(b.rt.tier).toBe('high');
  });
  it('warm-up frames do not count', () => {
    const { rt } = rig('forest', { warmupSec: 5 });
    run(rt, 4.9, 100);
    expect(rt.tier).toBe('high');
  });
  it('dino variant swap waits for the camera to leave the close-up', async () => {
    const { rt, swap, dir, endFade } = rig('closeup');
    rt.forceTier('medium');
    endFade();
    run(rt, 1, 16);
    expect(swap).not.toHaveBeenCalled();
    dir.state = 'flying'; run(rt, 1, 16);
    expect(swap).not.toHaveBeenCalled();
    dir.state = 'forest'; rt.update(0.016);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(swap).toHaveBeenCalledWith('low');
    expect(rt.transitioning).toBe(true);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    rt.update(0.016);
    expect(swap).toHaveBeenCalledTimes(1);
    expect(rt.dinoSwapPending).toBe(false);
  });
  it('WebGL2 turns compute effects off; params parse', () => {
    expect(effectiveBudget('high', false).verlet).toBe(false);
    expect(effectiveBudget('high', true).verlet).toBe(true);
    expect(qualityParams('?tier=medium&governor=0')).toEqual({ tier: 'medium', governor: false });
    expect(qualityParams('?tier=ultra')).toEqual({ tier: null, governor: true });
  });
  it('without a swap callback the governor keeps working after the first downgrade', () => {
    const { rt, endFade } = rig('forest', { swapDinoVariant: undefined });
    run(rt, 3.1, 40); endFade();
    run(rt, 6, 40);
    expect(rt.tier).toBe('low');
  });
  it('polls atmosphere stats only while a switch fades (no per-frame allocation when idle)', () => {
    const { rt, atmo, endFade } = rig();
    const spy = vi.spyOn(atmo, 'stats');
    run(rt, 1, 10);
    expect(spy).not.toHaveBeenCalled();
    rt.forceTier('medium'); rt.update(0.01);
    expect(spy).toHaveBeenCalled();
    endFade(); rt.update(0.01); spy.mockClear();
    run(rt, 1, 10);
    expect(spy).not.toHaveBeenCalled();
  });
  it('a second downgrade during a pending flora deferral keeps flora shadows until the fade ends', () => {
    const { rt, veg } = rig();
    rt.forceTier('medium'); rt.forceTier('low');
    expect(veg.setTier).toHaveBeenLastCalledWith('high', { fern: 1500, cycad: 110, conifer: 45, shrub: 110 });
  });
  it('pre-compiles the hidden contact shadows once, leaving them hidden', () => {
    const mesh: any = { visible: false };
    const seen: boolean[] = [];
    const r: any = { info: { compute: { calls: 0 } }, compileAsync: vi.fn((m: any) => { seen.push(m.visible); return Promise.resolve(); }) };
    const atmo = { setTier: vi.fn(), stats: () => ({ transitioning: false }), contactShadows: { mesh } };
    const rt = new QualityRuntime({ renderer: r, isWebGPU: true, tier: 'high', atmosphere: atmo, scene: {} as any, camera: {} as any });
    rt.update(0.016); rt.update(0.016);
    expect(r.compileAsync).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([true]);
    expect(mesh.visible).toBe(false);
  });
});
