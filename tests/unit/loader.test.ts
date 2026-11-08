import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Group, Object3D } from 'three/webgpu';

const loadSpecies = vi.fn();
vi.mock('../../src/content/load', () => ({ loadSpecies: (id: string) => loadSpecies(id) }));

import { ContentStore, wantsUpgrade } from '../../src/app/loader';
import { DinoWorld } from '../../src/dinos/world';
import type { Dino } from '../../src/dinos/dino';

const content = (id: string) => ({ id, commonName: { en: id, vi: id } }) as never;

beforeEach(() => loadSpecies.mockReset());

describe('ContentStore', () => {
  it('does not cache a failed fetch, so a retry fetches again and succeeds', async () => {
    loadSpecies.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(content('tyrannosaurus'));
    const store = new ContentStore();
    await expect(store.get('tyrannosaurus')).rejects.toThrow('offline');
    expect(store.peek('tyrannosaurus')).toBeUndefined();
    await expect(store.get('tyrannosaurus')).resolves.toEqual(content('tyrannosaurus'));
    expect(loadSpecies).toHaveBeenCalledTimes(2);
    expect(store.peek('tyrannosaurus')).toBeDefined();
  });

  it('shares one fetch between concurrent get calls and serves later calls from the cache', async () => {
    let resolve!: (c: unknown) => void;
    loadSpecies.mockReturnValue(new Promise((r) => { resolve = r; }));
    const store = new ContentStore();
    const a = store.get('triceratops');
    const b = store.get('triceratops');
    expect(a).toBe(b);
    resolve(content('triceratops'));
    await a;
    await store.get('triceratops');
    expect(loadSpecies).toHaveBeenCalledTimes(1);
  });

  it('shares the failure between concurrent callers and then allows a retry', async () => {
    loadSpecies.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(content('triceratops'));
    const store = new ContentStore();
    const results = await Promise.allSettled([store.get('triceratops'), store.get('triceratops')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(loadSpecies).toHaveBeenCalledTimes(1);
    await expect(store.get('triceratops')).resolves.toBeDefined();
  });
});

const fakeDino = (id: string, variant: 'low' | 'high') => {
  const root = new Group();
  const proxy = new Object3D();
  root.add(proxy);
  const d = {
    id, variant, root, proxy, currentClip: null as string | null, focusRadius: 4,
    play: vi.fn(), desync: vi.fn(), update: vi.fn(), matchPose: vi.fn(), dispose: vi.fn(),
  };
  proxy.userData.dino = d;
  return d as unknown as Dino & typeof d;
};

describe('DinoWorld.replace', () => {
  it('swaps the model in place: same spot and heading, pose matched, old one disposed, picking uses the new proxy', () => {
    const scene = new Group();
    const world = new DinoWorld(scene as never);
    const low = fakeDino('tyrannosaurus', 'low');
    world.add(low, 'wander');
    low.root.position.set(3, 0, 4);
    low.root.rotation.y = 1.2;
    const replaced = vi.fn();
    world.onDinoReplaced = replaced;
    const high = fakeDino('tyrannosaurus', 'high');
    expect(world.replace(low, high)).toBe(true);
    expect(world.dinos).toEqual([high]);
    expect(scene.children).toContain(high.root);
    expect(high.root.position.toArray()).toEqual([3, 0, 4]);
    expect(high.root.rotation.y).toBe(1.2);
    expect(high.matchPose).toHaveBeenCalledWith(low);
    expect(low.dispose).toHaveBeenCalled();
    expect(replaced).toHaveBeenCalledWith(low, high);
    world.update(0.1); // the new model is the one that is driven
    expect(high.update).toHaveBeenCalled();
    expect(low.update).not.toHaveBeenCalled();
  });

  it('returns false for a dino that is not in the world', () => {
    const world = new DinoWorld(new Group() as never);
    expect(world.replace(fakeDino('a', 'low'), fakeDino('a', 'high'))).toBe(false);
  });
});

describe('wantsUpgrade', () => {
  const entry = { files: { high: 'h.glb', low: 'l.glb' } } as never;
  it('upgrades a light animal on the high tier only', () => {
    expect(wantsUpgrade(fakeDino('a', 'low'), entry, 'high')).toBe(true);
    expect(wantsUpgrade(fakeDino('a', 'low'), entry, 'medium')).toBe(false);
    expect(wantsUpgrade(fakeDino('a', 'high'), entry, 'high')).toBe(false);
    expect(wantsUpgrade(fakeDino('a', 'low'), undefined, 'high')).toBe(false);
  });
});
