import { describe, expect, it } from 'vitest';
import { validateManifest } from '../../src/assets/manifest';

const example = {
  species: 'tyrannosaurus',
  sourceUrl: 'https://sketchfab.com/3d-models/example',
  author: 'Someone',
  license: 'CC-BY-4.0',
  modifications: ['decimated'],
  files: { high: 'models/tyrannosaurus.high.glb', low: 'models/tyrannosaurus.low.glb' },
  clips: { idle: 'Idle', walk: 'Walk' },
  status: 'candidate',
};

describe('validateManifest', () => {
  it('accepts the example', () => {
    expect(validateManifest([example])).toHaveLength(1);
  });
  it('accepts all ADR 0013 licences', () => {
    for (const license of ['CC0', 'CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-NC-3.0', 'CC-BY-NC-4.0']) {
      expect(() => validateManifest([{ ...example, license }])).not.toThrow();
    }
  });
  it('rejects licence CC-BY-ND-4.0', () => {
    expect(() => validateManifest([{ ...example, license: 'CC-BY-ND-4.0' }])).toThrow(/license/);
  });
  it('rejects an approved entry without files.low', () => {
    expect(() => validateManifest([{ ...example, status: 'approved', files: { high: example.files.high } }])).toThrow(/files\.low/);
    expect(() => validateManifest([{ ...example, status: 'approved', files: { high: example.files.high, low: '' } }])).toThrow(/files\.low/);
  });
  it('allows a candidate with an empty files.low', () => {
    expect(() => validateManifest([{ ...example, files: { high: 'a', low: '' } }])).not.toThrow();
  });
  it('rejects unknown species, non-array input and bad clips', () => {
    expect(() => validateManifest([{ ...example, species: 'trex' }])).toThrow(/species/);
    expect(() => validateManifest({})).toThrow();
    expect(() => validateManifest([{ ...example, clips: { fly: 'x' } }])).toThrow(/clips/);
  });
});
