import { describe, it, expect } from 'vitest';
import { detectTier, FpsGovernor } from '../../src/core/quality';
import { BUDGETS } from '../../src/core/budgets';

describe('detectTier', () => {
  it('no webgpu -> low', () => {
    expect(detectTier({ webgpu: false, mobile: false, hardwareConcurrency: 16 })).toBe('low');
  });
  it('webgpu mobile -> medium', () => {
    expect(detectTier({ webgpu: true, mobile: true, hardwareConcurrency: 8 })).toBe('medium');
  });
  it('webgpu desktop with >=8 cores -> high', () => {
    expect(detectTier({ webgpu: true, mobile: false, hardwareConcurrency: 8 })).toBe('high');
  });
  it('webgpu desktop with few cores -> medium', () => {
    expect(detectTier({ webgpu: true, mobile: false, hardwareConcurrency: 4 })).toBe('medium');
  });
});

describe('FpsGovernor', () => {
  const feed = (g: FpsGovernor, seconds: number, ms: number) => {
    const out: (string | null)[] = [];
    for (let t = 0; t < seconds * 1000; t += ms) out.push(g.sample(ms));
    return out.filter((x) => x !== null);
  };
  it('downgrades once per full window and never below low', () => {
    const g = new FpsGovernor({ downgradeBelow: 28, windowSec: 3, startTier: 'high' });
    expect(feed(g, 3.1, 40)).toEqual(['medium']);
    expect(g.tier).toBe('medium');
    expect(feed(g, 1, 40)).toEqual([]);
    expect(feed(g, 2.2, 40)).toEqual(['low']);
    expect(feed(g, 10, 40)).toEqual([]);
    expect(g.tier).toBe('low');
  });
  it('never upgrades on good fps', () => {
    const g = new FpsGovernor({ downgradeBelow: 28, windowSec: 3, startTier: 'medium' });
    expect(feed(g, 10, 8)).toEqual([]);
    expect(g.tier).toBe('medium');
  });
});

describe('BUDGETS', () => {
  it('shadows/godrays/verlet only on high', () => {
    for (const t of ['low', 'medium'] as const) {
      expect(BUDGETS[t].shadows).toBe(false);
      expect(BUDGETS[t].godrays).toBe(false);
      expect(BUDGETS[t].verlet).toBe(false);
    }
    expect(BUDGETS.high.shadows).toBe(true);
    expect(BUDGETS.high.ferns).toBe(6000);
  });
});
