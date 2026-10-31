import { describe, expect, it, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const out = mkdtempSync(join(tmpdir(), 'optimize-'));
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function tris(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  }
  return n;
}

describe('optimize.mjs', () => {
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
  it('uses meshopt compression', () => {
    expect(high.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toContain('EXT_meshopt_compression');
  });
});
