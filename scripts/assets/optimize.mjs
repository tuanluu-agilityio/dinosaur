#!/usr/bin/env node
// Usage: node scripts/assets/optimize.mjs <input.glb> <outDir> [name]
// Writes <outDir>/<name>.high.glb and <name>.low.glb (meshopt + KTX2). Requires `toktx` on PATH.
import { basename, extname, join, resolve } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, weld, simplify, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

export const VARIANTS = {
  high: { maxTex: 2048, simplifyRatio: null },
  low: { maxTex: 1024, simplifyRatio: 0.35 },
};
const SIMPLIFY_ERROR = 0.01;

// Transcode every texture to KTX2 via the `toktx` CLI. Colour slots: sRGB + ETC1S; data slots (normal, ORM): linear + UASTC.
function toKtx2() {
  return async (document) => {
    const dir = mkdtempSync(join(tmpdir(), 'ktx-'));
    try {
      const textures = document.getRoot().listTextures();
      for (const [i, tex] of textures.entries()) {
        const slots = document.getGraph().listParentEdges(tex).map((e) => e.getName());
        const colour = slots.some((n) => /^(baseColorTexture|emissiveTexture)$/.test(n));
        const ext = tex.getMimeType() === 'image/jpeg' ? 'jpg' : 'png';
        const src = join(dir, `t${i}.${ext}`);
        const dst = join(dir, `t${i}.ktx2`);
        writeFileSync(src, tex.getImage());
        const args = ['--t2', '--genmipmap', '--assign_oetf', colour ? 'srgb' : 'linear', '--assign_primaries', 'bt709'];
        if (colour) args.push('--encode', 'etc1s', '--qlevel', '4', '--clevel', '1');
        else args.push('--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18');
        execFileSync('toktx', [...args, dst, src], { stdio: 'pipe' });
        tex.setImage(new Uint8Array(readFileSync(dst))).setMimeType('image/ktx2');
        if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.\w+$/, '.ktx2'));
      }
      if (textures.length) document.createExtension(KHRTextureBasisu).setRequired(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

export async function optimize(input, outDir, name = basename(input, extname(input))) {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO()
    .registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const [variant, cfg] of Object.entries(VARIANTS)) {
    const doc = await io.read(input);
    const steps = [dedup(), prune(), resample(), weld()];
    if (cfg.simplifyRatio) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: cfg.simplifyRatio, error: SIMPLIFY_ERROR }));
    // Downscale first (sharp), then transcode to KTX2. Normal/ORM slots use UASTC, colour uses ETC1S.
    steps.push(
      textureCompress({ encoder: sharp, resize: [cfg.maxTex, cfg.maxTex], targetFormat: 'png' }),
      toKtx2(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    await doc.transform(...steps);
    const file = join(outDir, `${name}.${variant}.glb`);
    await io.write(file, doc);
    written.push(file);
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [input, outDir, name] = process.argv.slice(2);
  if (!input || !outDir) {
    console.error('usage: optimize.mjs <input.glb> <outDir> [name]');
    process.exit(2);
  }
  const files = await optimize(input, outDir, name);
  for (const f of files) console.log(f);
}
