import { describe, expect, it, vi } from 'vitest';
import { createSpeciesLoader, type SpeciesSource } from '../../src/ui/credits';
import { SPECIES_IDS, type SpeciesContent } from '../../src/content/schema';

function fakeStore(failing?: string) {
  const get = vi.fn(async (id: string) => {
    if (id === failing) throw new Error('404');
    return { id, commonName: { en: id, vi: id }, scientificName: id, sources: [] } as unknown as SpeciesContent;
  });
  return { get } as SpeciesSource & { get: ReturnType<typeof vi.fn> };
}

describe('credits species loader', () => {
  it('fetches nothing before load() and one species each through the store after', async () => {
    const store = fakeStore();
    const getStore = vi.fn(async () => store);
    const l = createSpeciesLoader(getStore);
    expect(getStore).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
    const list = await l.load();
    expect(list).toHaveLength(SPECIES_IDS.length);
    await l.load();
    expect(store.get).toHaveBeenCalledTimes(SPECIES_IDS.length);
  });
  it('skips a failed species', async () => {
    const l = createSpeciesLoader(async () => fakeStore('triceratops'));
    expect((await l.load()).map((s) => s.id)).not.toContain('triceratops');
  });
});
