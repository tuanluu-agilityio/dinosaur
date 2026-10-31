import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { hasToktx } from '../../scripts/assets/optimize.mjs';

const out = mkdtempSync(join(tmpdir(), 'optimize-'));
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function tris(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  }
  return n;
}

// toktx (KTX-Software) is not installed on ubuntu-latest CI; the KTX2 suite is skipped there.
const toktxSuite = hasToktx() ? describe : describe.skip;

describe('optimize.mjs --preview (no toktx needed)', () => {
  it('writes PNG-texture previews with the same simplification as the shipped variants', async () => {
    const pdir = mkdtempSync(join(tmpdir(), 'optimize-prev-'));
    execFileSync('node', ['scripts/assets/optimize.mjs', 'tests/fixtures/box-animated.glb', pdir, 'box-animated', '--preview'], { stdio: 'pipe' });
    const pio = new NodeIO();
    const ph = await pio.read(join(pdir, 'box-animated.high.preview.glb'));
    const pl = await pio.read(join(pdir, 'box-animated.low.preview.glb'));
    expect(tris(pl)).toBeLessThanOrEqual(tris(ph) * 0.5);
    for (const t of pl.getRoot().listTextures()) expect(t.getMimeType()).toBe('image/png');
    expect(pl.getRoot().listAnimations().map((a) => a.getName()).sort()).toEqual(['idle', 'walk']);
  }, 60000);
});

toktxSuite('optimize.mjs (requires toktx)', () => {
  let high;
  let low;
  beforeAll(async () => {
    execFileSync('node', ['scripts/assets/optimize.mjs', 'tests/fixtures/box-animated.glb', out], { stdio: 'pipe' });
    await MeshoptDecoder.ready;
    high = await io.read(join(out, 'box-animated.high.glb'));
    low = await io.read(join(out, 'box-animated.low.glb'));
  }, 180000);

  it('low has <= 50% of high triangles', () => {
    expect(tris(high)).toBeGreaterThan(0);
    expect(tris(low)).toBeLessThanOrEqual(tris(high) * 0.5);
  });
  it('textures are KTX2 and within size caps', () => {
    const size = (d) => Math.max(...d.getRoot().listTextures().map((t) => Math.max(...t.getSize())));
    for (const d of [high, low]) {
      expect(d.getRoot().listTextures().length).toBeGreaterThan(0);
      for (const t of d.getRoot().listTextures()) expect(t.getMimeType()).toBe('image/ktx2');
    }
    expect(size(high)).toBeLessThanOrEqual(2048);
    expect(size(low)).toBeLessThanOrEqual(1024);
  });
  it('preserves animation clip names', () => {
    const names = (d) => d.getRoot().listAnimations().map((a) => a.getName()).sort();
    expect(names(high)).toEqual(['idle', 'walk']);
    expect(names(low)).toEqual(names(high));
  });
  it('preview low has the same triangle count as low.glb', async () => {
    const pdir = mkdtempSync(join(tmpdir(), 'optimize-prev-'));
    execFileSync('node', ['scripts/assets/optimize.mjs', 'tests/fixtures/box-animated.glb', pdir, 'box-animated', '--preview'], { stdio: 'pipe' });
    const pl = await new NodeIO().read(join(pdir, 'box-animated.low.preview.glb'));
    expect(tris(pl)).toBe(tris(low));
  }, 60000);
  it('uses meshopt compression', () => {
    expect(high.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toContain('EXT_meshopt_compression');
  });
});
