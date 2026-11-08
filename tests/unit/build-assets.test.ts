import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

describe('production build assets', () => {
  it('ships the Basis transcoder in dist/basis/', () => {
    const out = mkdtempSync(join(tmpdir(), 'dino-dist-'));
    try {
      execFileSync(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', out, '--emptyOutDir'], {
        cwd: root,
        stdio: 'pipe',
      });
      for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
        expect(existsSync(join(out, 'basis', f)), `dist/basis/${f}`).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 180_000);

  it('keeps public/basis byte-identical to the copy in three', () => {
    for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
      const ours = readFileSync(join(root, 'public', 'basis', f));
      const theirs = readFileSync(join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis', f));
      expect(ours.equals(theirs), f).toBe(true);
    }
  });
});
