import { describe, expect, it } from 'vitest';
import {
  ClipFader, FADE_SECONDS, WALK_SPEED, clipForSpeed, createGraze, createHerd, createWander, ellipsePolygon,
  newAgent, pointInPolygon, resolveClip, type Agent,
} from '../../src/dinos/behaviours';

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const area = ellipsePolygon(6, -35, 22, 26, 24);

describe('wander', () => {
  it('keeps position inside the area polygon for 10 000 steps', () => {
    for (const seed of [1, 2, 3]) {
      const rng = mulberry(seed);
      const a = newAgent(6, -35, 0);
      const w = createWander(area, 1.2, rng);
      let moved = 0;
      for (let i = 0; i < 10_000; i++) {
        w.step(a, 0.1);
        expect(pointInPolygon(a.x, a.z, area)).toBe(true);
        if (a.speed > 0) moved++;
      }
      expect(moved).toBeGreaterThan(1000); // it actually walks, it is not stuck
    }
  });

  it('survives a large dt without leaving the polygon', () => {
    const a = newAgent(6, -35, 0);
    const w = createWander(area, 1.2, mulberry(9));
    for (let i = 0; i < 2000; i++) { w.step(a, 0.5); expect(pointInPolygon(a.x, a.z, area)).toBe(true); }
  });
});

describe('herd', () => {
  it('keeps every member 3-8 m from its nearest neighbour and never closer than 3 m', () => {
    const rng = mulberry(7);
    const members: Agent[] = [newAgent(2, -30, 0), newAgent(7, -30, 0), newAgent(5, -26, 0), newAgent(9, -34, 0)];
    const herd = createHerd(members, area, 0.8, rng);
    let walking = 0;
    for (let i = 0; i < 6000; i++) {
      herd.step(0.1);
      for (const m of members) if (m.speed > 0) walking++;
      for (let p = 0; p < members.length; p++) {
        let nearest = Infinity;
        for (let q = 0; q < members.length; q++) {
          if (p === q) continue;
          const d = Math.hypot(members[p].x - members[q].x, members[p].z - members[q].z);
          expect(d).toBeGreaterThanOrEqual(3 - 1e-6);
          nearest = Math.min(nearest, d);
        }
        expect(nearest).toBeLessThanOrEqual(8 + 1e-6);
        expect(pointInPolygon(members[p].x, members[p].z, area)).toBe(true);
      }
    }
    expect(walking).toBeGreaterThan(500);
  });
});

describe('graze', () => {
  it('stays inside, mostly stands still and eats', () => {
    const a = newAgent(6, -35, 0);
    const g = createGraze(area, 0.78, mulberry(4));
    let still = 0;
    for (let i = 0; i < 5000; i++) {
      g.step(a, 0.1);
      expect(pointInPolygon(a.x, a.z, area)).toBe(true);
      if (a.speed < 0.1) still++;
    }
    expect(still / 5000).toBeGreaterThan(0.5);
  });
});

describe('speed to clip mapping', () => {
  it('maps < 0.1 m/s to idle or eat and everything else to walk', () => {
    expect(clipForSpeed(0, false)).toBe('idle');
    expect(clipForSpeed(0.09, false)).toBe('idle');
    expect(clipForSpeed(0, true)).toBe('eat');
    expect(clipForSpeed(0.05, true)).toBe('eat');
    expect(clipForSpeed(0.1, false)).toBe('walk');
    expect(clipForSpeed(1.2, true)).toBe('walk');
  });
  it('uses the measured root speeds', () => {
    expect(WALK_SPEED.tyrannosaurus).toBe(1.2);
    expect(WALK_SPEED.triceratops).toBe(0.78);
    expect(WALK_SPEED.pachycephalosaurus).toBe(0.7);
  });
  it('falls back to a clip the model has', () => {
    expect(resolveClip(['idle', 'walk'], 'eat')).toBe('idle');
    expect(resolveClip(['idle', 'walk', 'eat'], 'eat')).toBe('eat');
    expect(resolveClip(['idle', 'walk'], 'run')).toBe('walk');
    expect(resolveClip([], 'walk')).toBeNull();
  });
});

describe('clip cross-fade', () => {
  it('requests a 0.4 s fade on state change only', () => {
    const f = new ClipFader();
    expect(FADE_SECONDS).toBe(0.4);
    expect(f.request('idle')).toBe(0); // first clip starts without a fade
    expect(f.request('idle')).toBeNull();
    expect(f.request('walk')).toBe(0.4);
    expect(f.request('walk')).toBeNull();
    expect(f.request('walk')).toBeNull();
    expect(f.request('idle')).toBe(0.4);
  });
});
