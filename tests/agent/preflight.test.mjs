import { describe, it, expect } from 'vitest';
import { runPreflight } from '../../scripts/agent/lib/preflight.mjs';

const OK = {
  'gh auth status': "Logged in to github.com\n  - Token scopes: 'gist', 'project', 'read:org', 'repo', 'workflow'",
  'git remote get-url origin': 'https://github.com/u/t-rex.git',
  'git branch --show-current': 'main',
  'git config core.hooksPath': '.githooks',
  'python -c import edge_tts': '',
  'blender --version': 'Blender 4.2.3 LTS',
  'toktx --version': 'toktx v4.3.2',
};

function env(overrides = {}, extra = {}) {
  const table = { ...OK, ...overrides };
  return {
    exec: async (cmd, args) => {
      const key = [cmd, ...args].join(' ');
      if (table[key] === undefined || table[key] === null) return { ok: false, stdout: '' };
      return { ok: true, stdout: table[key] };
    },
    nodeVersion: '24.1.0',
    envVars: { SKETCHFAB_API_TOKEN: 'x'.repeat(32) },
    dotenv: '',
    ...extra,
  };
}

const check = (r, name) => r.checks.find((c) => c.name === name);

describe('runPreflight', () => {
  it('passes when everything is present', async () => {
    const r = await runPreflight(env());
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('fails gh scopes without project and suggests the fix', async () => {
    const r = await runPreflight(env({ 'gh auth status': "Token scopes: 'repo', 'workflow'" }));
    expect(r.ok).toBe(false);
    expect(check(r, 'gh-scopes')).toMatchObject({ ok: false, fix: 'gh auth refresh -s project' });
  });

  it('fails when blender is older than 4.2', async () => {
    const r = await runPreflight(env({ 'blender --version': 'Blender 3.6.0' }));
    expect(check(r, 'blender').ok).toBe(false);
  });

  it('fails when blender is missing', async () => {
    const r = await runPreflight(env({ 'blender --version': null }));
    expect(check(r, 'blender').ok).toBe(false);
    expect(check(r, 'blender').fix).toMatch(/blender/i);
  });

  it('accepts the Sketchfab token from .env', async () => {
    const r = await runPreflight(env({}, { envVars: {}, dotenv: `SKETCHFAB_API_TOKEN=${'y'.repeat(32)}\n` }));
    expect(check(r, 'sketchfab-token').ok).toBe(true);
  });

  it('fails an empty Sketchfab token', async () => {
    const r = await runPreflight(env({}, { envVars: {}, dotenv: 'SKETCHFAB_API_TOKEN=\n' }));
    expect(check(r, 'sketchfab-token').ok).toBe(false);
  });

  it('fails node older than 20', async () => {
    const r = await runPreflight(env({}, { nodeVersion: '18.19.0' }));
    expect(check(r, 'node').ok).toBe(false);
  });
});
